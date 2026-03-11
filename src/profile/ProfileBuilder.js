const TasteProfile = require('../db/models/TasteProfile');
const tmdb = require('../clients/tmdb');
const { translateImdbToTmdb } = require('../id_mapping/id_cache');
const { BINGE_SESSION_GAP_MS, BINGE_MULTIPLIER } = require('../config');
const GLOBAL_PROFILE_MIRROR_RATIO = 0.2;

function mergeProcessedIds(existingIds = [], newIds = []) {
    return Array.from(new Set([...existingIds, ...newIds].map(id => id?.toString()).filter(Boolean)));
}

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
        // Use findOneAndUpdate with upsert to avoid race conditions creating duplicate profiles
        let profile = await TasteProfile.findOneAndUpdate(
            { owner, context },
            { $setOnInsert: { processedTraktIds: [], processedStremioIds: [] } },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        );

        const shouldMirrorToGlobal = context && context !== 'global';
        let globalProfile = null;
        if (shouldMirrorToGlobal) {
            globalProfile = await TasteProfile.findOneAndUpdate(
                { owner, context: 'global' },
                { $setOnInsert: { processedTraktIds: [], processedStremioIds: [] } },
                { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
            );
        }

        // Filtra solo quelli non ancora processati
        const seenProcessedIds = new Set((profile.processedTraktIds || []).map(id => id.toString()));
        const newItems = traktHistory.filter(item => {
            const id = item.movie?.ids?.tmdb || item.show?.ids?.tmdb || item.movie?.ids?.imdb || item.show?.ids?.imdb;
            if (!id || seenProcessedIds.has(id.toString())) return false;
            seenProcessedIds.add(id.toString());
            return true;
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
                const id = item.movie?.ids?.tmdb || item.show?.ids?.tmdb || item.movie?.ids?.imdb || item.show?.ids?.imdb;
                if (id) sessionMultiplierMap.set(id.toString(), multiplier);
            }
        }

        // Processa in batch per non saturare TMDB
        const batchSize = 5;
        const processedProfileIds = [];
        const processedGlobalIds = [];
        for (let i = 0; i < newItems.length; i += batchSize) {
            const batch = newItems.slice(i, i + batchSize);
            const promises = batch.map(async (item) => {
                const tmdbIdRaw = item.movie?.ids?.tmdb || item.show?.ids?.tmdb;
                const imdbId = item.movie?.ids?.imdb || item.show?.ids?.imdb;
                const tmdbId = tmdbIdRaw || (imdbId ? (await translateImdbToTmdb(imdbId, apiKey))?.id : null);
                const processedId = tmdbIdRaw || imdbId || tmdbId;
                const type = item.movie ? 'movie' : 'tv';
                if (!tmdbId || !processedId) return;

                try {
                    const details = await tmdb.getTmdbMovieDetails(apiKey, tmdbId, type);
                    if (details) {
                        const bingeMultiplier = sessionMultiplierMap.get(processedId.toString()) || 1.0;
                        this.processItem(profile, details, bingeMultiplier);
                        processedProfileIds.push(processedId.toString());
                        if (globalProfile && !globalProfile.processedTraktIds.includes(processedId.toString())) {
                            this.processItem(globalProfile, details, bingeMultiplier * GLOBAL_PROFILE_MIRROR_RATIO);
                            processedGlobalIds.push(processedId.toString());
                        }
                    }
                } catch (e) {
                    console.error(`Errore processamento item ${tmdbId}:`, e.message);
                }
            });

            await Promise.all(promises);
        }

        await profile.save();
        if (processedProfileIds.length > 0) {
            await TasteProfile.updateOne(
                { owner, context },
                { $addToSet: { processedTraktIds: { $each: processedProfileIds } } }
            );
            profile.processedTraktIds = mergeProcessedIds(profile.processedTraktIds, processedProfileIds);
        }
        if (globalProfile) {
            await globalProfile.save();
            if (processedGlobalIds.length > 0) {
                await TasteProfile.updateOne(
                    { owner, context: 'global' },
                    { $addToSet: { processedTraktIds: { $each: processedGlobalIds } } }
                );
                globalProfile.processedTraktIds = mergeProcessedIds(globalProfile.processedTraktIds, processedGlobalIds);
            }
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

        // Use findOneAndUpdate with upsert to avoid race conditions
        let profile = await TasteProfile.findOneAndUpdate(
            { owner, context: 'global' },
            { $setOnInsert: { processedTraktIds: [], processedStremioIds: [] } },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        );

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
        const existingStremioIds = new Set((profile.processedStremioIds || []).map(id => id.toString()));
        const processedStremioIds = [];
        for (let i = 0; i < allItems.length; i += batchSize) {
            const batch = allItems.slice(i, i + batchSize);
            await Promise.all(batch.map(async ({ item, weight }) => {
                const id = item.id || item._id; // Stremio usa id o _id
                const type = item.type === 'series' ? 'tv' : 'movie';

                // Evita duplicati se già processato con peso simile
                if (!id || existingStremioIds.has(id.toString())) return;
                existingStremioIds.add(id.toString());

                try {
                    const details = await tmdb.getTmdbMovieDetails(apiKey, id, type);
                    if (details) {
                        this.processItem(profile, details, weight);
                        processedStremioIds.push(id.toString());
                    }
                } catch (e) {
                    console.error(`[ProfileBuilder] Errore processamento item Stremio ${id}:`, e.message);
                }
            }));
        }

        await profile.save();
        if (processedStremioIds.length > 0) {
            await TasteProfile.updateOne(
                { owner, context: 'global' },
                { $addToSet: { processedStremioIds: { $each: processedStremioIds } } }
            );
            profile.processedStremioIds = mergeProcessedIds(profile.processedStremioIds, processedStremioIds);
        }
        return profile;
    }
    /**
     * Deduces new DNA based on the dominant score values in the profile.
     * Stores new DNA suggestions in a pending staging area without mutating active DNA.
     * @param {Object} profile Il documento TasteProfile
     */
    static async inferDNAFromProfile(profile) {
        if (!profile) return;

        try {
            const User = require('../db/models/User');
            const userDoc = await User.findOne({ userId: profile.owner });
            if (!userDoc) return;

            // Logica di threshold per considerare un asse come "Pilastro"
            const MIN_ABSOLUTE_SCORE = 3.0; // Punteggio minimo assoluto per considerarlo (evita rumore iniziale)
            const DOMINANCE_RATIOS = { // Percentuale minima sul totale della categoria
                genre: 0.15,   // 15% minimo per permettere più generi in profili eterogenei
                keyword: 0.08, // 8% vista la frammentazione delle keyword
                country: 0.25  // 25% per i paesi
            };
            // Rimosso STABILITY_GAP: se due generi sono forti (es. 20% e 18%), li vogliamo entrambi come DNA.

            // Helper function per analizzare una mappa di score
            const analyzeScores = (scoreMap, type, existingDNAIds, targetSuggestedDNA, nameResolver = null) => {
                if (!scoreMap || scoreMap.size === 0) return;

                // 1. Calcolo del totale della categoria
                let totalScore = 0;
                for (const score of scoreMap.values()) {
                    totalScore += score;
                }

                if (totalScore === 0) return;

                // 2. Ordina per punteggio decrescente
                const sorted = Array.from(scoreMap.entries()).sort((a, b) => b[1] - a[1]);
                if (sorted.length === 0) return;

                // 3. Estrazione dei tratti dominanti (anche multipli)
                const dominanceThreshold = DOMINANCE_RATIOS[type] || 0.15;
                
                // Iteriamo sui tratti finché troviamo pilastri validi
                for (const [id, score] of sorted) {
                    const isAbsoluteValid = score >= MIN_ABSOLUTE_SCORE;
                    const isDominant = (score / totalScore) >= dominanceThreshold;
                    
                    if (isAbsoluteValid && isDominant) {
                        if (!existingDNAIds.has(id)) {
                            targetSuggestedDNA.push({
                                type,
                                id: id,
                                name: nameResolver ? nameResolver(id) : id
                            });
                            existingDNAIds.add(id);
                        }
                    } else {
                        // Poiché l'array è ordinato, se un elemento non passa la dominanza,
                        // nessuno degli elementi successivi (con punteggio minore) lo farà.
                        break; 
                    }
                }
            };

            const inferredTraits = [];
            const inferredIds = new Set();
            analyzeScores(profile.genreScores, 'genre', inferredIds, inferredTraits, (id) => `Genre ${id}`);
            analyzeScores(profile.keywordScores, 'keyword', inferredIds, inferredTraits, (id) => `Keyword ${id}`);
            analyzeScores(profile.countryScores, 'country', inferredIds, inferredTraits, (id) => id);

            if (inferredTraits.length === 0) return;

            const userProfiles = Array.isArray(userDoc.profiles) ? userDoc.profiles : [];
            const userProfile = userProfiles.find(p => p.id === profile.context);

            if (!userProfile && profile.context === 'global' && userProfiles.length > 0) {
                let hasChanges = false;
                for (const targetProfile of userProfiles) {
                    if (!targetProfile) continue;
                    if (!targetProfile.settings || typeof targetProfile.settings !== 'object') {
                        targetProfile.settings = {};
                    }
                    const manual = targetProfile.settings.manualDNA || [];
                    const suggested = targetProfile.settings.suggestedDNA || [];
                    const pending = targetProfile.settings.pendingDNASuggestions || [];
                    const existingIds = new Set([
                        ...manual.map((item) => `${item.type}:${item.id}`),
                        ...suggested.map((item) => `${item.type}:${item.id}`),
                        ...pending.map((item) => `${item.type}:${item.id}`)
                    ]);
                    const additions = inferredTraits.filter((item) => !existingIds.has(`${item.type}:${item.id}`));
                    if (additions.length > 0) {
                        targetProfile.settings.suggestedDNA = [...suggested, ...additions];
                        hasChanges = true;
                    }
                }
                if (hasChanges && typeof userDoc.save === 'function') {
                    await userDoc.save();
                }
                return;
            }

            if (!userProfile) return;

            const suggested = userProfile.settings?.suggestedDNA || [];
            const manual = userProfile.settings?.manualDNA || [];
            const pending = userProfile.settings?.pendingDNASuggestions || [];
            const existingDNAIds = new Set([
                ...suggested.map(p => p.id),
                ...manual.map(p => p.id),
                ...pending.map(p => p.id)
            ]);
            const nextPending = [...pending];

            inferredTraits.forEach((item) => {
                if (!existingDNAIds.has(item.id)) {
                    nextPending.push(item);
                    existingDNAIds.add(item.id);
                }
            });

            if (nextPending.length > pending.length) {
                await User.findOneAndUpdate(
                    { userId: profile.owner, 'profiles.id': profile.context },
                    { $set: { 'profiles.$.settings.pendingDNASuggestions': nextPending } }
                );
                console.log(`💡 Nuovi DNA in pending per l'utente ${profile.owner}, contesto ${profile.context}`);
            }

        } catch (e) {
            console.error("Errore durante l'inferenza del DNA:", e.message);
        }
    }
}

module.exports = ProfileBuilder;
