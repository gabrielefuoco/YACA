const TasteProfile = require('../db/models/TasteProfile');
const tmdb = require('../clients/tmdb');
const { BINGE_SESSION_GAP_MS, BINGE_MULTIPLIER } = require('../config');

/**
 * Applies logarithmic time-decay accumulation so that repeated scores give
 * diminishing returns, preventing the profile from going "flat".
 * Formula: new = current + increment / (1 + ln(1 + current))
 * @param {Number} current Existing score
 * @param {Number} increment New increment to add
 * @returns {Number} Updated score with time-decay
 */
function addWithDecay(current, increment) {
    return current + increment / (1 + Math.log(1 + Math.abs(current)));
}

class ProfileBuilder {
    /**
     * Elabora un singolo contenuto TMDB e aggiorna i punteggi nel profilo.
     * @param {Object} profile Il documento Mongoose TasteProfile
     * @param {Object} tmdbData I dati grezzi da TMDB (con credits e keywords)
     * @param {Number} weight Moltiplicatore per i punteggi (default 1.0)
     */
    static processItem(profile, tmdbData, weight = 1.0) {
        if (!tmdbData) return;

        // 1. Generi (+1.0 primo, +0.6 secondo, +0.3 restanti) — with logarithmic decay
        if (tmdbData.genres && tmdbData.genres.length > 0) {
            tmdbData.genres.forEach((g, index) => {
                const genreId = g.id.toString();
                let score = 0.3;
                if (index === 0) score = 1.0;
                else if (index === 1) score = 0.6;

                const current = profile.genreScores.get(genreId) || 0;
                profile.genreScores.set(genreId, addWithDecay(current, score * weight));
            });
        }

        // 2. Keywords (+1.0 ciascuna) — with logarithmic decay
        const keywords = tmdbData.keywords?.keywords || tmdbData.keywords?.results || [];
        keywords.forEach(kw => {
            const kwId = kw.id.toString();
            const current = profile.keywordScores.get(kwId) || 0;
            profile.keywordScores.set(kwId, addWithDecay(current, 1.0 * weight));
        });

        // 3. Registi (+1.0 ciascuno) — with logarithmic decay
        if (tmdbData.credits && tmdbData.credits.crew) {
            const directors = tmdbData.credits.crew.filter(c => c.job === 'Director');
            directors.forEach(d => {
                const directorId = d.id.toString();
                const current = profile.directorScores.get(directorId) || 0;
                profile.directorScores.set(directorId, addWithDecay(current, 1.0 * weight));
            });
        }

        // 4. Attori (+1.0 primi 3) — with logarithmic decay
        if (tmdbData.credits && tmdbData.credits.cast) {
            tmdbData.credits.cast.slice(0, 3).forEach(a => {
                const actorId = a.id.toString();
                const current = profile.actorScores.get(actorId) || 0;
                profile.actorScores.set(actorId, addWithDecay(current, 1.0 * weight));
            });
        }

        // 5. Studios (+1.0 ciascuna production company) — with logarithmic decay
        if (tmdbData.production_companies) {
            tmdbData.production_companies.forEach(s => {
                const studioId = s.id.toString();
                const current = profile.studioScores.get(studioId) || 0;
                profile.studioScores.set(studioId, addWithDecay(current, 1.0 * weight));
            });
        }

        // 6. Era (+1.0 per decade) — with logarithmic decay
        const releaseDate = tmdbData.release_date || tmdbData.first_air_date;
        if (releaseDate) {
            const year = new Date(releaseDate).getFullYear();
            if (!isNaN(year)) {
                const decade = `${Math.floor(year / 10) * 10}s`;
                const current = profile.eraScores.get(decade) || 0;
                profile.eraScores.set(decade, addWithDecay(current, 1.0 * weight));
            }
        }

        // 7. Paese (+1.0 ciascuno) — with logarithmic decay
        const countries = tmdbData.origin_country || (tmdbData.production_countries ? tmdbData.production_countries.map(c => c.iso_3166_1) : []);
        countries.forEach(c => {
            const current = profile.countryScores.get(c) || 0;
            profile.countryScores.set(c, addWithDecay(current, 1.0 * weight));
        });

        // 8. Runtime (+1.0) — with logarithmic decay
        const runtime = tmdbData.runtime || (tmdbData.episode_run_time ? tmdbData.episode_run_time[0] : null);
        if (runtime) {
            let category = "medium";
            if (runtime < 90) category = "short";
            else if (runtime > 150) category = "long";

            const current = profile.runtimeScores.get(category) || 0;
            profile.runtimeScores.set(category, addWithDecay(current, 1.0 * weight));
        }

        profile.lastUpdated = new Date();
    }

    /**
     * Sincronizza la cronologia Trakt dell'utente con il suo TasteProfile.
     * @param {String} owner Email o ID utente
     * @param {String} context Contesto (es. 'global' o ID preset)
     * @param {Array} traktHistory Elementi della history da Trakt
     * @param {String} apiKey Chiave API TMDB
     */
    static async syncUserHistory(owner, context, traktHistory, apiKey) {
        let profile = await TasteProfile.findOne({ owner, context });
        if (!profile) {
            profile = new TasteProfile({ owner, context });
        }
        const shouldMirrorToGlobal = context && context !== 'global';
        let globalProfile = null;
        if (shouldMirrorToGlobal) {
            globalProfile = await TasteProfile.findOne({ owner, context: 'global' });
            if (!globalProfile) {
                globalProfile = new TasteProfile({ owner, context: 'global' });
            }
        }

        // Filtra solo quelli non ancora processati
        const newItems = traktHistory.filter(item => {
            const id = item.movie?.ids?.tmdb || item.show?.ids?.tmdb;
            return id && !profile.processedTraktIds.includes(id.toString());
        });

        if (newItems.length === 0) return profile;

        // Binge-watching detection: sort items by watched_at, group by session
        // A session is a group of items watched within BINGE_SESSION_GAP_MS of each other
        const itemsWithTime = newItems.map(item => ({
            item,
            watchedAt: item.watched_at ? new Date(item.watched_at).getTime() : 0
        })).sort((a, b) => a.watchedAt - b.watchedAt);

        // Group into sessions by looking at consecutive gaps
        const sessions = [];
        if (itemsWithTime.length > 0) {
        let currentSession = [itemsWithTime[0]];
        for (let i = 1; i < itemsWithTime.length; i++) {
            const prev = itemsWithTime[i - 1];
            const curr = itemsWithTime[i];
            const gap = Math.abs(curr.watchedAt - prev.watchedAt);
            if (gap <= BINGE_SESSION_GAP_MS) {
                currentSession.push(curr);
            } else {
                sessions.push(currentSession);
                currentSession = [curr];
            }
        }
        sessions.push(currentSession);
        }

        // Determine frequency multiplier: session with >= 3 items in one day counts as binge
        const sessionMultiplierMap = new Map();
        for (const session of sessions) {
            const isBinge = session.length >= 3;
            const multiplier = isBinge ? BINGE_MULTIPLIER : 1.0;
            for (const { item } of session) {
                const tmdbId = item.movie?.ids?.tmdb || item.show?.ids?.tmdb;
                if (tmdbId) sessionMultiplierMap.set(tmdbId, multiplier);
            }
        }

        // Processa in batch per non saturare TMDB
        const batchSize = 5;
        for (let i = 0; i < newItems.length; i += batchSize) {
            const batch = newItems.slice(i, i + batchSize);
            const promises = batch.map(async (item) => {
                const tmdbId = item.movie?.ids?.tmdb || item.show?.ids?.tmdb;
                const type = item.movie ? 'movie' : 'tv';

                try {
                    const details = await tmdb.getTmdbMovieDetails(apiKey, tmdbId, type);
                    if (details) {
                        const bingeMultiplier = sessionMultiplierMap.get(tmdbId) || 1.0;
                        this.processItem(profile, details, bingeMultiplier);
                        profile.processedTraktIds.push(tmdbId.toString());
                        if (globalProfile && !globalProfile.processedTraktIds.includes(tmdbId.toString())) {
                            this.processItem(globalProfile, details, bingeMultiplier * 0.2);
                            globalProfile.processedTraktIds.push(tmdbId.toString());
                        }
                    }
                } catch (e) {
                    console.error(`Errore processamento item ${tmdbId}:`, e.message);
                }
            });

            await Promise.all(promises);
        }

        await profile.save();
        if (globalProfile) {
            await globalProfile.save();
        }

        await this.inferDNAFromProfile(profile);
        if (globalProfile) {
            await this.inferDNAFromProfile(globalProfile);
        }
        return profile;
    }

    /**
     * Sincronizza i dati da Stremio (Likes, Loves, Library) con il profilo globale.
     * @param {String} owner Email o ID utente
     * @param {Object} stremioData { liked, loved, library }
     * @param {String} apiKey Chiave API TMDB
     */
    static async syncStremioData(owner, stremioData, apiKey) {
        if (!stremioData) return;

        // Stremio alimenta SEMPRE il profilo globale
        let profile = await TasteProfile.findOne({ owner, context: 'global' });
        if (!profile) {
            profile = new TasteProfile({ owner, context: 'global' });
        }

        const allItems = [
            ...stremioData.loved.map(item => ({ item, weight: 4.0 })),
            ...stremioData.liked.map(item => ({ item, weight: 3.0 })),
            ...stremioData.library.map(item => {
                const isWatched = item.state?.watched && (item.state?.overallProgress >= 0.9);
                return { item, weight: isWatched ? 2.0 : 1.0 };
            })
        ];

        // Processa in batch
        const batchSize = 5;
        for (let i = 0; i < allItems.length; i += batchSize) {
            const batch = allItems.slice(i, i + batchSize);
            await Promise.all(batch.map(async ({ item, weight }) => {
                const id = item.id || item._id; // Stremio usa id o _id
                const type = item.type === 'series' ? 'tv' : 'movie';

                // Evita duplicati se già processato con peso simile
                if (profile.processedTraktIds.includes(id.toString())) return;

                try {
                    const details = await tmdb.getTmdbMovieDetails(apiKey, id, type);
                    if (details) {
                        this.processItem(profile, details, weight);
                        profile.processedTraktIds.push(id.toString());
                    }
                } catch (e) {
                    console.error(`[ProfileBuilder] Errore processamento item Stremio ${id}:`, e.message);
                }
            }));
        }

        await profile.save();
        return profile;
    }
    /**
     * Deduces new DNA based on the dominant score values in the profile.
     * Updates the User document's suggestedDNA if a new DNA is found.
     * @param {Object} profile Il documento TasteProfile
     */
    static async inferDNAFromProfile(profile) {
        if (!profile) return;
        if (profile.context === 'global') return;

        try {
            const User = require('../db/models/User');
            const userDoc = await User.findOne({ userId: profile.owner });
            if (!userDoc) return;

            const targetProfiles = Array.isArray(userDoc.profiles) ? userDoc.profiles.filter(p => p.id === profile.context) : [];
            if (targetProfiles.length === 0) return;

            // Logica di threshold per considerare un asse come "Pilastro"
            const MIN_SCORE_THRESHOLD = 50;

            // Helper function per analizzare una mappa di score
            const analyzeScores = (scoreMap, type, existingDNAIds, targetSuggestedDNA, nameResolver = null) => {
                if (!scoreMap || scoreMap.size === 0) return;

                // Ordina per score decrescente
                const sorted = Array.from(scoreMap.entries()).sort((a, b) => b[1] - a[1]);
                if (sorted.length === 0) return;

                const topItem = sorted[0];
                const topId = topItem[0];
                const topScore = topItem[1];

                // Rilevamento: il punteggio deve superare una soglia, 
                // e (se c'è un secondo elemento) deve essere almeno il doppio del secondo
                let isDNA = topScore >= MIN_SCORE_THRESHOLD;
                if (isDNA && sorted.length > 1) {
                    const secondScore = sorted[1][1];
                    if (topScore < secondScore * 2) {
                        isDNA = false; // Non è "sproporzionatamente" più alto
                    }
                }

                if (isDNA && !existingDNAIds.has(topId)) {
                    targetSuggestedDNA.push({
                        type,
                        id: topId,
                        name: nameResolver ? nameResolver(topId) : topId
                    });
                    existingDNAIds.add(topId);
                }
            };

            let hasUpdates = false;
            for (const userProfile of targetProfiles) {
                const suggested = userProfile.settings?.suggestedDNA || [];
                const manual = userProfile.settings?.manualDNA || [];
                const existingDNAIds = new Set([...suggested.map(p => p.id), ...manual.map(p => p.id)]);
                const beforeCount = suggested.length;

                // Mapping molto basico per i nomi in questa fase di inferenza background
                // Il frontend o il DB dovrebbero avere nomi migliori, qui usiamo l'ID o deduzioni logiche se necessario
                analyzeScores(profile.genreScores, 'genre', existingDNAIds, suggested, (id) => `Genre ${id}`);
                analyzeScores(profile.keywordScores, 'keyword', existingDNAIds, suggested, (id) => `Keyword ${id}`);
                analyzeScores(profile.countryScores, 'country', existingDNAIds, suggested, (id) => id);

                if (suggested.length > beforeCount) {
                    if (!userProfile.settings) userProfile.settings = {};
                    userProfile.settings.suggestedDNA = suggested;
                    hasUpdates = true;
                }
            }

            if (hasUpdates) {
                await userDoc.save();
                console.log(`💡 Nuovi DNA suggeriti inferiti per l'utente ${profile.owner}, contesto ${profile.context}`);
            }

        } catch (e) {
            console.error("Errore durante l'inferenza del DNA:", e.message);
        }
    }
}

module.exports = ProfileBuilder;
