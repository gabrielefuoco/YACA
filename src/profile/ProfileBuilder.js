const TasteProfile = require('../db/models/TasteProfile');
const tmdb = require('../clients/tmdb');

class ProfileBuilder {
    /**
     * Elabora un singolo contenuto TMDB e aggiorna i punteggi nel profilo.
     * @param {Object} profile Il documento Mongoose TasteProfile
     * @param {Object} tmdbData I dati grezzi da TMDB (con credits e keywords)
     * @param {Number} weight Moltiplicatore per i punteggi (default 1.0)
     */
    static processItem(profile, tmdbData, weight = 1.0) {
        if (!tmdbData) return;

        // 1. Generi (+1.0 primo, +0.6 secondo, +0.3 restanti)
        if (tmdbData.genres && tmdbData.genres.length > 0) {
            tmdbData.genres.forEach((g, index) => {
                const genreId = g.id.toString();
                let score = 0.3;
                if (index === 0) score = 1.0;
                else if (index === 1) score = 0.6;

                const current = profile.genreScores.get(genreId) || 0;
                profile.genreScores.set(genreId, current + (score * weight));
            });
        }

        // 2. Keywords (+1.0 ciascuna)
        const keywords = tmdbData.keywords?.keywords || tmdbData.keywords?.results || [];
        keywords.forEach(kw => {
            const kwId = kw.id.toString();
            const current = profile.keywordScores.get(kwId) || 0;
            profile.keywordScores.set(kwId, current + (1.0 * weight));
        });

        // 3. Registi (+1.0 ciascuno)
        if (tmdbData.credits && tmdbData.credits.crew) {
            const directors = tmdbData.credits.crew.filter(c => c.job === 'Director');
            directors.forEach(d => {
                const directorId = d.id.toString();
                const current = profile.directorScores.get(directorId) || 0;
                profile.directorScores.set(directorId, current + (1.0 * weight));
            });
        }

        // 4. Attori (+1.0 primi 3)
        if (tmdbData.credits && tmdbData.credits.cast) {
            tmdbData.credits.cast.slice(0, 3).forEach(a => {
                const actorId = a.id.toString();
                const current = profile.actorScores.get(actorId) || 0;
                profile.actorScores.set(actorId, current + (1.0 * weight));
            });
        }

        // 5. Studios (+1.0 ciascuna production company)
        if (tmdbData.production_companies) {
            tmdbData.production_companies.forEach(s => {
                const studioId = s.id.toString();
                const current = profile.studioScores.get(studioId) || 0;
                profile.studioScores.set(studioId, current + (1.0 * weight));
            });
        }

        // 6. Era (+1.0 per decade)
        const releaseDate = tmdbData.release_date || tmdbData.first_air_date;
        if (releaseDate) {
            const year = new Date(releaseDate).getFullYear();
            if (!isNaN(year)) {
                const decade = `${Math.floor(year / 10) * 10}s`;
                const current = profile.eraScores.get(decade) || 0;
                profile.eraScores.set(decade, current + (1.0 * weight));
            }
        }

        // 7. Paese (+1.0 ciascuno)
        const countries = tmdbData.origin_country || (tmdbData.production_countries ? tmdbData.production_countries.map(c => c.iso_3166_1) : []);
        countries.forEach(c => {
            const current = profile.countryScores.get(c) || 0;
            profile.countryScores.set(c, current + (1.0 * weight));
        });

        // 8. Runtime (+1.0)
        const runtime = tmdbData.runtime || (tmdbData.episode_run_time ? tmdbData.episode_run_time[0] : null);
        if (runtime) {
            let category = "medium";
            if (runtime < 90) category = "short";
            else if (runtime > 150) category = "long";

            const current = profile.runtimeScores.get(category) || 0;
            profile.runtimeScores.set(category, current + (1.0 * weight));
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

        // Filtra solo quelli non ancora processati
        const newItems = traktHistory.filter(item => {
            const id = item.movie?.ids?.tmdb || item.show?.ids?.tmdb;
            return id && !profile.processedTraktIds.includes(id.toString());
        });

        if (newItems.length === 0) return profile;

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
                        this.processItem(profile, details);
                        profile.processedTraktIds.push(tmdbId.toString());
                    }
                } catch (e) {
                    console.error(`Errore processamento item ${tmdbId}:`, e.message);
                }
            });

            await Promise.all(promises);
        }

        await profile.save();
        await this.inferPillarsFromProfile(profile);
        return profile;
    }
    /**
     * Deduces new pillars based on the dominant score values in the profile.
     * Updates the User document's suggestedPillars if a new pillar is found.
     * @param {Object} profile Il documento TasteProfile
     */
    static async inferPillarsFromProfile(profile) {
        if (!profile || profile.context === 'global') return;

        try {
            const User = require('../db/models/User');
            const userDoc = await User.findOne({ userId: profile.owner });
            if (!userDoc) return;

            const userProfile = userDoc.profiles?.find(p => p.id === profile.context);
            if (!userProfile) return;

            const suggested = userProfile.settings?.suggestedPillars || [];
            const manual = userProfile.settings?.manualPillars || [];
            const existingPillarIds = new Set([...suggested.map(p => p.id), ...manual.map(p => p.id)]);

            let newPillarsFound = false;

            // Logica di threshold per considerare un asse come "Pilastro"
            const MIN_SCORE_THRESHOLD = 50;

            // Helper function per analizzare una mappa di score
            const analyzeScores = (scoreMap, type, nameResolver = null) => {
                if (!scoreMap || scoreMap.size === 0) return;

                // Ordina per score decrescente
                const sorted = Array.from(scoreMap.entries()).sort((a, b) => b[1] - a[1]);
                if (sorted.length === 0) return;

                const topItem = sorted[0];
                const topId = topItem[0];
                const topScore = topItem[1];

                // Rilevamento: il punteggio deve superare una soglia, 
                // e (se c'è un secondo elemento) deve essere almeno il doppio del secondo
                let isPillar = topScore >= MIN_SCORE_THRESHOLD;
                if (isPillar && sorted.length > 1) {
                    const secondScore = sorted[1][1];
                    if (topScore < secondScore * 2) {
                        isPillar = false; // Non è "sproporzionatamente" più alto
                    }
                }

                if (isPillar && !existingPillarIds.has(topId)) {
                    suggested.push({
                        type,
                        id: topId,
                        name: nameResolver ? nameResolver(topId) : topId
                    });
                    existingPillarIds.add(topId);
                    newPillarsFound = true;
                }
            };

            // Mapping molto basico per i nomi in questa fase di inferenza background
            // Il frontend o il DB dovrebbero avere nomi migliori, qui usiamo l'ID o deduzioni logiche se necessario
            analyzeScores(profile.genreScores, 'genre', (id) => `Genre ${id}`);
            analyzeScores(profile.keywordScores, 'keyword', (id) => `Keyword ${id}`);
            analyzeScores(profile.countryScores, 'country', (id) => id);

            if (newPillarsFound) {
                if (!userProfile.settings) userProfile.settings = {};
                userProfile.settings.suggestedPillars = suggested;
                await userDoc.save();
                console.log(`💡 Nuovi pilastri suggeriti inferiti per l'utente ${profile.owner}, profilo ${profile.context}`);
            }

        } catch (e) {
            console.error("Errore durante l'inferenza dei pilastri:", e.message);
        }
    }
}

module.exports = ProfileBuilder;
