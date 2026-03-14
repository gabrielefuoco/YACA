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
     * Elabora un singolo contenuto TMDB e accumula gli incrementi in un oggetto.
     * @param {Object} tmdbData I dati grezzi da TMDB
     * @param {Number} weight Moltiplicatore per i punteggi
     * @param {Object} [increments] Oggetto opzionale per accumulare gli incrementi
     * @returns {Object} Gli incrementi accumulati
     */
    static processItem(tmdbData, weight = 1.0, increments = {}) {
        if (!tmdbData) return increments;

        const ensureNested = (obj, key) => {
            if (!obj[key]) obj[key] = {};
            return obj[key];
        };

        // 1. Generi (+1.0 primo, +0.6 secondo, +0.3 restanti)
        if (tmdbData.genres && tmdbData.genres.length > 0) {
            const genreIncrements = ensureNested(increments, 'genreScores');
            tmdbData.genres.forEach((g, index) => {
                const genreId = g.id.toString();
                let score = 0.3;
                if (index === 0) score = 1.0;
                else if (index === 1) score = 0.6;
                genreIncrements[genreId] = (genreIncrements[genreId] || 0) + (score * weight);
            });
        }

        // 2. Keywords (+1.0 ciascuna)
        const keywords = tmdbData.keywords?.keywords || tmdbData.keywords?.results || [];
        if (keywords.length > 0) {
            const keywordIncrements = ensureNested(increments, 'keywordScores');
            keywords.forEach(kw => {
                const kwId = kw.id.toString();
                keywordIncrements[kwId] = (keywordIncrements[kwId] || 0) + (1.0 * weight);
            });
        }

        // 3. Registi (+1.0 ciascuno)
        if (tmdbData.credits && tmdbData.credits.crew) {
            const directors = tmdbData.credits.crew.filter(c => c.job === 'Director');
            if (directors.length > 0) {
                const directorIncrements = ensureNested(increments, 'directorScores');
                directors.forEach(d => {
                    const directorId = d.id.toString();
                    directorIncrements[directorId] = (directorIncrements[directorId] || 0) + (1.0 * weight);
                });
            }
        }

        // 4. Attori (+1.0 primi 3)
        if (tmdbData.credits && tmdbData.credits.cast) {
            const actorIncrements = ensureNested(increments, 'actorScores');
            tmdbData.credits.cast.slice(0, 3).forEach(a => {
                const actorId = a.id.toString();
                actorIncrements[actorId] = (actorIncrements[actorId] || 0) + (1.0 * weight);
            });
        }

        // 5. Studios (+1.0 ciascuna production company)
        if (tmdbData.production_companies && tmdbData.production_companies.length > 0) {
            const studioIncrements = ensureNested(increments, 'studioScores');
            tmdbData.production_companies.forEach(s => {
                const studioId = s.id.toString();
                studioIncrements[studioId] = (studioIncrements[studioId] || 0) + (1.0 * weight);
            });
        }

        // 6. Era (+1.0 per decade)
        const releaseDate = tmdbData.release_date || tmdbData.first_air_date;
        if (releaseDate) {
            const year = new Date(releaseDate).getFullYear();
            if (!isNaN(year)) {
                const decade = `${Math.floor(year / 10) * 10}s`;
                const eraIncrements = ensureNested(increments, 'eraScores');
                eraIncrements[decade] = (eraIncrements[decade] || 0) + (1.0 * weight);
            }
        }

        // 7. Paese (+1.0 ciascuno)
        const countries = tmdbData.origin_country || (tmdbData.production_countries ? tmdbData.production_countries.map(c => c.iso_3166_1) : []);
        if (countries.length > 0) {
            const countryIncrements = ensureNested(increments, 'countryScores');
            countries.forEach(c => {
                countryIncrements[c] = (countryIncrements[c] || 0) + (1.0 * weight);
            });
        }

        // 8. Runtime (+1.0)
        const runtime = tmdbData.runtime || (tmdbData.episode_run_time ? tmdbData.episode_run_time[0] : null);
        if (runtime) {
            let category = "medium";
            if (runtime < 90) category = "short";
            else if (runtime > 150) category = "long";

            const runtimeIncrements = ensureNested(increments, 'runtimeScores');
            runtimeIncrements[category] = (runtimeIncrements[category] || 0) + (1.0 * weight);
        }

        return increments;
    }

    /**
     * Applica gli incrementi in modo atomico usando MongoDB $inc.
     * @param {String} owner 
     * @param {String} context 
     * @param {Object} increments 
     */
    static async saveAtomic(owner, context, increments) {
        if (!increments || Object.keys(increments).length === 0) return;

        const updateDoc = { $set: { lastUpdated: new Date() }, $inc: {} };
        
        // Convert the nested increments object to MongoDB dot notation
        for (const [category, scores] of Object.entries(increments)) {
            for (const [id, value] of Object.entries(scores)) {
                // We use $inc for the scores. 
                // Note: The logarithmic decay is now harder to apply purely with $inc.
                // We will apply a simplified linear increment here for performance/concurrency,
                // or we could stick to the read-modify-save model inside the lock.
                // Given the user wants atomic updates, we'll use $inc.
                updateDoc.$inc[`${category}.${id}`] = value;
            }
        }

        await TasteProfile.updateOne({ owner, context }, updateDoc);
    }

    /**
     * Sincronizza la cronologia Trakt dell'utente con il suo TasteProfile.
     * @param {String} owner Email o ID utente
     * @param {String} context Contesto (es. 'global' o ID preset)
     * @param {Array} traktHistory Elementi della history da Trakt
     * @param {String} apiKey Chiave API TMDB
     */
    static async syncUserHistory(owner, context, traktHistory, apiKey) {
        if (!owner || !traktHistory?.length) return null;

        try {
            // Use findOneAndUpdate with upsert to avoid race conditions creating duplicate profiles
            let profile = await TasteProfile.findOneAndUpdate(
                { owner, context },
                { $setOnInsert: { processedTraktIds: [], processedStremioIds: [] } },
                { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
            );

            const shouldMirrorToGlobal = context && context !== 'global';
            let globalProfileProcessedIds = [];
            if (shouldMirrorToGlobal) {
                const globalProfile = await TasteProfile.findOneAndUpdate(
                    { owner, context: 'global' },
                    { $setOnInsert: { processedTraktIds: [], processedStremioIds: [] } },
                    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
                );
                globalProfileProcessedIds = globalProfile.processedTraktIds || [];
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

            // Binge-watching detection
            const itemsWithTime = newItems.map(item => ({
                item,
                watchedAt: item.watched_at ? new Date(item.watched_at).getTime() : 0
            })).sort((a, b) => a.watchedAt - b.watchedAt);

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

            const sessionMultiplierMap = new Map();
            for (const session of sessions) {
                const multiplier = session.length >= 3 ? BINGE_MULTIPLIER : 1.0;
                for (const { item } of session) {
                    const id = item.movie?.ids?.tmdb || item.show?.ids?.tmdb || item.movie?.ids?.imdb || item.show?.ids?.imdb;
                    if (id) sessionMultiplierMap.set(id.toString(), multiplier);
                }
            }

            const batchSize = 5;
            const processedProfileIds = [];
            const processedGlobalIds = [];
            const profileIncrements = {};
            const globalIncrements = {};

            const globalSeenSet = new Set(globalProfileProcessedIds.map(id => id.toString()));

            for (let i = 0; i < newItems.length; i += batchSize) {
                const batch = newItems.slice(i, i + batchSize);
                await Promise.all(batch.map(async (item) => {
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
                            ProfileBuilder.processItem(details, bingeMultiplier, profileIncrements);
                            processedProfileIds.push(processedId.toString());
                            
                            if (shouldMirrorToGlobal && !globalSeenSet.has(processedId.toString())) {
                                ProfileBuilder.processItem(details, bingeMultiplier * GLOBAL_PROFILE_MIRROR_RATIO, globalIncrements);
                                processedGlobalIds.push(processedId.toString());
                            }
                        }
                    } catch (e) {
                        console.error(`Errore processamento item ${tmdbId}:`, e.message);
                    }
                }));
            }

            // Apply atomic increments
            await ProfileBuilder.saveAtomic(owner, context, profileIncrements);
            if (Object.keys(globalIncrements).length > 0) {
                await ProfileBuilder.saveAtomic(owner, 'global', globalIncrements);
            }

            if (processedProfileIds.length > 0) {
                await TasteProfile.updateOne(
                    { owner, context },
                    { $addToSet: { processedTraktIds: { $each: processedProfileIds } } }
                );
            }
            if (processedGlobalIds.length > 0) {
                await TasteProfile.updateOne(
                    { owner, context: 'global' },
                    { $addToSet: { processedTraktIds: { $each: processedGlobalIds } } }
                );
            }

            // Reload profile and infer DNA
            const updatedProfile = await TasteProfile.findOne({ owner, context });
            await this.inferDNAFromProfile(updatedProfile);
            if (shouldMirrorToGlobal) {
                const updatedGlobal = await TasteProfile.findOne({ owner, context: 'global' });
                await this.inferDNAFromProfile(updatedGlobal);
            }
            return updatedProfile;

        } catch (e) {
            console.error(`[ProfileBuilder] Sync error for ${owner}:${context}:`, e.message);
            throw e;
        }
    }

    /**
     * Sincronizza i dati da Stremio (Likes, Loves, Library) con il profilo globale.
     * @param {String} owner Email o ID utente
     * @param {Object} stremioData { liked, loved, library }
     * @param {String} apiKey Chiave API TMDB
     */
    static async syncStremioData(owner, stremioData, apiKey) {
        if (!stremioData || !owner) return null;

        try {
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

            const batchSize = 5;
            const existingStremioIds = new Set((profile.processedStremioIds || []).map(id => id.toString()));
            const processedStremioIds = [];
            const profileIncrements = {};

            for (let i = 0; i < allItems.length; i += batchSize) {
                const batch = allItems.slice(i, i + batchSize);
                await Promise.all(batch.map(async ({ item, weight }) => {
                    const id = item.id || item._id; // Stremio uses id or _id
                    const type = item.type === 'series' ? 'tv' : 'movie';

                    if (!id || existingStremioIds.has(id.toString())) return;
                    existingStremioIds.add(id.toString());

                    try {
                        const details = await tmdb.getTmdbMovieDetails(apiKey, id, type);
                        if (details) {
                            ProfileBuilder.processItem(details, weight, profileIncrements);
                            processedStremioIds.push(id.toString());
                        }
                    } catch (e) {
                        console.error(`[ProfileBuilder] Stremio sync error for item ${id}:`, e.message);
                    }
                }));
            }

            // Apply atomic increments
            if (Object.keys(profileIncrements).length > 0) {
                await ProfileBuilder.saveAtomic(owner, 'global', profileIncrements);
            }

            if (processedStremioIds.length > 0) {
                await TasteProfile.updateOne(
                    { owner, context: 'global' },
                    { $addToSet: { processedStremioIds: { $each: processedStremioIds } } }
                );
            }
            
            return await TasteProfile.findOne({ owner, context: 'global' });
        } catch (e) {
            console.error(`[ProfileBuilder] Stremio sync error for ${owner}:`, e.message);
            throw e;
        }
    }
    /**
     * Deduces new DNA based on the dominant score values in the profile.
     * Stores new DNA suggestions in a pending staging area without mutating active DNA.
     * @param {Object} profile Il documento TasteProfile
     */
    static async inferDNAFromProfile(profile) {
        if (!profile) return;

        try {
            const User = require('../models/User');
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
                    const existingIds = new Set([
                        ...manual.map((item) => `${item.type}:${item.id}`),
                        ...suggested.map((item) => `${item.type}:${item.id}`)
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
            const existingDNAIds = new Set([
                ...suggested.map(p => `${p.type}:${p.id}`),
                ...manual.map(p => `${p.type}:${p.id}`)
            ]);
            const nextSuggested = [...suggested];

            inferredTraits.forEach((item) => {
                const itemKey = `${item.type}:${item.id}`;
                if (!existingDNAIds.has(itemKey)) {
                    nextSuggested.push(item);
                    existingDNAIds.add(itemKey);
                }
            });

            if (nextSuggested.length > suggested.length) {
                await User.findOneAndUpdate(
                    { userId: profile.owner, 'profiles.id': profile.context },
                    { $set: { 'profiles.$.settings.suggestedDNA': nextSuggested } }
                );
                console.log(`💡 Nuovi DNA suggeriti aggiunti direttamente per l'utente ${profile.owner}, contesto ${profile.context}`);
            }

        } catch (e) {
            console.error("Errore durante l'inferenza del DNA:", e.message);
        }
    }
}

module.exports = ProfileBuilder;
