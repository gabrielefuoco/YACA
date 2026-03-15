const TasteProfile = require('../models/TasteProfile');
const tmdb = require('../clients/tmdb');
const { translateImdbToTmdb } = require('../id_mapping/id_cache');
const { BINGE_SESSION_GAP_MS, BINGE_MULTIPLIER } = require('../config');
const AddonConfig = require('../db/models/AddonConfig');
const UserAccount = require('../db/models/UserAccount');
const GLOBAL_PROFILE_MIRROR_RATIO = 0.2;

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
     * Resolves the addon UUID for a given owner (userId).
     * Used for unidirectional join: UserAccount.addonUuid → AddonConfig.uuid.
     * AddonConfig does NOT contain userId (Security by Design: full anonymity).
     * @param {String} owner - userId of the user
     * @returns {Promise<String|null>} The addon UUID, or null if not found
     */
    static async _resolveAddonUuid(owner) {
        try {
            const account = await UserAccount.findOne({ userId: owner }).lean();
            return account?.addonUuid || null;
        } catch (_e) {
            return null;
        }
    }

    /**
     * Updates syncStatus in AddonConfig using the anonymous UUID join.
     * @param {String} owner - userId of the user
     * @param {Object} statusUpdate - Fields to $set in syncStatus
     */
    static async _updateSyncStatus(owner, statusUpdate) {
        try {
            const uuid = await ProfileBuilder._resolveAddonUuid(owner);
            if (!uuid) return; // AddonConfig may not exist yet for legacy users
            await AddonConfig.updateOne(
                { uuid },
                { $set: statusUpdate }
            );
        } catch (_e) {
            // Non-blocking: AddonConfig may not exist yet for legacy users
        }
    }

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
            const idNames = ensureNested(increments, 'idNames');
            tmdbData.genres.forEach((g, index) => {
                const genreId = g.id.toString();
                idNames[genreId] = g.name; // Capture name
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
            const idNames = ensureNested(increments, 'idNames');
            keywords.forEach(kw => {
                const kwId = kw.id.toString();
                idNames[kwId] = kw.name; // Capture name
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
            if (category === 'idNames') {
                for (const [id, name] of Object.entries(scores)) {
                    updateDoc.$set = updateDoc.$set || {};
                    updateDoc.$set[`idNames.${id}`] = name;
                }
                continue;
            }
            for (const [id, value] of Object.entries(scores)) {
                updateDoc.$inc[`${category}.${id}`] = value;
            }
        }

        await TasteProfile.updateOne({ owner, context }, updateDoc, { upsert: true });
    }

    /**
     * Sincronizza la cronologia Trakt dell'utente con il suo TasteProfile.
     * @param {String} owner Email o ID utente
     * @param {String} context Contesto (es. 'global' o ID preset)
     * @param {Array} traktHistory Elementi della history da Trakt
     * @param {String} apiKey Chiave API TMDB
     * @param {Boolean} isMirroring Se questo è un mirroring dal profilo custom al globale
     */
    static async syncUserHistory(owner, context, traktHistory, apiKey, isMirroring = false) {
        if (!owner || !traktHistory?.length) return null;

        // Update syncStatus: signal that sync is in progress (Phase 0.4)
        // Uses anonymous UUID join (no userId in AddonConfig)
        ProfileBuilder._updateSyncStatus(owner, {
            'syncStatus.isSyncing': true,
            'syncStatus.total': traktHistory.length,
            'syncStatus.current': 0
        }).catch(() => { /* non-blocking */ });

        try {
            let profile = await TasteProfile.findOneAndUpdate(
                { owner, context },
                { $setOnInsert: { processedTraktIds: [], processedStremioIds: [] } },
                { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
            );

            const seenProcessedIds = new Set((profile.processedTraktIds || []).map(id => id.toString()));
            const newItems = traktHistory.filter(item => {
                const id = item.movie?.ids?.tmdb || item.show?.ids?.tmdb || item.movie?.ids?.imdb || item.show?.ids?.imdb;
                if (!id || seenProcessedIds.has(id.toString())) return false;
                seenProcessedIds.add(id.toString());
                return true;
            });

            if (newItems.length === 0) return profile;

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
            const profileIncrements = {};

            const mirrorFactor = isMirroring ? GLOBAL_PROFILE_MIRROR_RATIO : 1.0;

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
                            ProfileBuilder.processItem(details, bingeMultiplier * mirrorFactor, profileIncrements);
                            processedProfileIds.push(processedId.toString());
                        }
                    } catch (e) {
                        console.error(`Errore processamento item ${tmdbId}:`, e.message);
                    }
                }));
            }

            await ProfileBuilder.saveAtomic(owner, context, profileIncrements);

            if (processedProfileIds.length > 0) {
                await TasteProfile.updateOne(
                    { owner, context },
                    { $addToSet: { processedTraktIds: { $each: processedProfileIds } } }
                );
            }

            const updatedProfile = await TasteProfile.findOne({ owner, context });
            await this.inferDNAFromProfile(updatedProfile);

            // Mirroring logic
            if (!isMirroring && context !== 'global' && GLOBAL_PROFILE_MIRROR_RATIO > 0) {
                console.log(`[DNA] Mirroring history from ${context} to global...`);
                await this.syncUserHistory(owner, 'global', traktHistory, apiKey, true);
            }

            // Update syncStatus: signal that sync is complete (Phase 0.4)
            // Uses anonymous UUID join (no userId in AddonConfig)
            ProfileBuilder._updateSyncStatus(owner, {
                'syncStatus.isSyncing': false,
                'syncStatus.lastSync': new Date()
            }).catch(() => { /* non-blocking */ });

            return updatedProfile;

        } catch (e) {
            // Update syncStatus on error too (anonymous UUID join)
            ProfileBuilder._updateSyncStatus(owner, {
                'syncStatus.isSyncing': false
            }).catch(() => { /* non-blocking */ });
            console.error(`[ProfileBuilder] Sync error for ${owner}:${context}:`, e.message);
            throw e;
        }
    }

    /**
     * Sincronizza i dati da Stremio (Likes, Loves, Library) con il profilo specificato.
     * @param {String} owner Email o ID utente
     * @param {Object} stremioData { liked, loved, library } o Array di item per profili custom
     * @param {String} apiKey Chiave API TMDB
     * @param {String} context Il contesto del profilo (default: 'global')
     * @param {Boolean} isMirroring Se questo è un mirroring dal profilo custom al globale
     */
    static async syncStremioData(owner, stremioData, apiKey = null, context = 'global', isMirroring = false) {
        if (!stremioData || !owner) return null;

        try {
            let profile = await TasteProfile.findOneAndUpdate(
                { owner, context },
                { $setOnInsert: { processedTraktIds: [], processedStremioIds: [] } },
                { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
            );

            let allItems = [];
            if (Array.isArray(stremioData)) {
                if (isMirroring) return null; 
                allItems = stremioData.map(item => ({ item, weight: 2.0 }));
            } else {
                allItems = [
                    ...(stremioData.loved || []).map(item => ({ item, weight: 4.0 })),
                    ...(stremioData.liked || []).map(item => ({ item, weight: 3.0 })),
                    ...(stremioData.library || []).map(item => {
                        const isWatched = item.state?.watched && (item.state?.overallProgress >= 0.9);
                        return { item, weight: isWatched ? 2.0 : 1.0 };
                    })
                ];
            }

            const batchSize = 5;
            const existingStremioIds = new Set((profile.processedStremioIds || []).map(id => id.toString()));
            const processedStremioIds = [];
            const profileIncrements = {};

            const mirrorFactor = isMirroring ? GLOBAL_PROFILE_MIRROR_RATIO : 1.0;

            // Update status at start
            await TasteProfile.updateOne(
                { owner, context },
                { 
                    $set: { 
                        'syncStatus.isSyncing': true, 
                        'syncStatus.total': allItems.length,
                        'syncStatus.current': 0
                    } 
                }
            );

            for (let i = 0; i < allItems.length; i += batchSize) {
                const batch = allItems.slice(i, i + batchSize);
                await Promise.all(batch.map(async ({ item, weight }) => {
                    let id = item.id || item._id; 
                    let type = item.type === 'series' ? 'tv' : 'movie';

                    if (!id || existingStremioIds.has(id.toString())) return;

                    try {
                        let details = null;
                        
                        // Handle Kitsu IDs
                        if (id.toString().startsWith('kitsu:')) {
                            const kitsuId = id.toString().split(':')[1];
                            const { getTmdbIdFromKitsuId } = require('../clients/kitsu');
                            const mapping = await getTmdbIdFromKitsuId(kitsuId);
                            
                            if (mapping) {
                                id = mapping.tmdbId;
                                type = mapping.type;
                                details = await tmdb.getTmdbMovieDetails(apiKey, id, type);
                            } else {
                                // Fallback: try to fetch Kitsu meta directly if mapping failed
                                console.warn(`[ProfileBuilder] No TMDB mapping for Kitsu:${kitsuId}. Using fallback metadata.`);
                                const { getKitsuMetaDetails } = require('../clients/kitsu');
                                const kitsuMeta = await getKitsuMetaDetails(kitsuId);
                                if (kitsuMeta) {
                                    // Mapping Kitsu categories to TMDB Genre IDs
                                    const kituToTmdbGenre = {
                                        'Action': 28, 'Adventure': 12, 'Comedy': 35, 'Drama': 18, 
                                        'Fantasy': 14, 'Horror': 27, 'Mystery': 9648, 'Romance': 10749, 
                                        'Sci-Fi': 878, 'Thriller': 53, 'Psychological': 53, 'Ecchi': 35,
                                        'Slice of Life': 18, 'Supernatural': 14, 'Magic': 14, 'Mecha': 878,
                                        'Military': 10752, 'Music': 10402, 'Police': 80, 'Sports': 18
                                    };

                                    // Synthesize TMDB-like details from Kitsu meta
                                    details = {
                                        id: `kitsu:${kitsuId}`,
                                        genres: (kitsuMeta.genres || []).map(g => ({
                                            id: kituToTmdbGenre[g] || 16, // Default to Animation (16) if no mapping
                                            name: g
                                        })),
                                        overview: kitsuMeta.description,
                                        title: kitsuMeta.name,
                                        name: kitsuMeta.name,
                                        keywords: { results: [] }
                                    };
                                    
                                    // Always ensure Animation genre is present for Kitsu items
                                    if (!details.genres.find(g => g.id === 16)) {
                                        details.genres.push({ id: 16, name: 'Animation' });
                                    }
                                }
                            }
                        } else {
                            details = await tmdb.getTmdbMovieDetails(apiKey, id, type);
                        }

                        if (details) {
                            ProfileBuilder.processItem(details, weight * mirrorFactor, profileIncrements);
                            processedStremioIds.push(item.id.toString());
                            existingStremioIds.add(item.id.toString());
                        }
                    } catch (e) {
                        console.error(`[ProfileBuilder] Stremio sync error for item ${id}:`, e.message);
                    }
                }));

                await TasteProfile.updateOne(
                    { owner, context },
                    { $set: { 'syncStatus.current': Math.min(i + batchSize, allItems.length) } }
                );
            }

            if (Object.keys(profileIncrements).length > 0) {
                await ProfileBuilder.saveAtomic(owner, context, profileIncrements);
            }

            if (processedStremioIds.length > 0) {
                await TasteProfile.updateOne(
                    { owner, context },
                    { 
                        $addToSet: { processedStremioIds: { $each: processedStremioIds } },
                        $set: { 'syncStatus.lastSync': new Date() }
                    }
                );
            }
            
            await TasteProfile.updateOne({ owner, context }, { $set: { 'syncStatus.isSyncing': false } });
            const updatedProfile = await TasteProfile.findOne({ owner, context });
            await this.inferDNAFromProfile(updatedProfile);

            // Mirroring logic
            if (!isMirroring && !Array.isArray(stremioData) && context !== 'global' && GLOBAL_PROFILE_MIRROR_RATIO > 0) {
                console.log(`[DNA] Mirroring history from ${context} to global...`);
                await this.syncStremioData(owner, stremioData, apiKey, 'global', true);
            }

            return updatedProfile;
        } catch (e) {
            console.error(`[ProfileBuilder] Stremio sync error for ${owner}:`, e.message);
            throw e;
        }
    }

    /**
     * Deduces new DNA based on the dominant score values in the profile.
     * @param {Object} profile Il documento TasteProfile
     */
    static async inferDNAFromProfile(profile) {
        if (!profile) return;

        try {
            // Resolve the addonUuid for this user (Two-Table Split)
            const uuid = await ProfileBuilder._resolveAddonUuid(profile.owner);
            if (!uuid) return;

            const AddonConfig = require('../db/models/AddonConfig');
            const addonConfig = await AddonConfig.findOne({ uuid });
            if (!addonConfig) return;

            const MIN_ABSOLUTE_SCORE = 0.5;
            const DOMINANCE_RATIOS = { 
                genre: 0.15,
                keyword: 0.08,
                country: 0.25
            };

            const analyzeScores = (scoreMap, idNamesMap, type, collectorArray) => {
                if (!scoreMap) return;
                const entries = scoreMap instanceof Map ? Array.from(scoreMap.entries()) : Object.entries(scoreMap);
                const totalScore = entries.reduce((sum, [_, score]) => sum + score, 0);
                if (totalScore === 0) return;

                const GENRE_MAP = {
                    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
                    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
                    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
                    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western", 10759: "Action & Adventure",
                    10762: "Kids", 10763: "News", 10764: "Reality", 10765: "Sci-Fi & Fantasy",
                    10766: "Soap", 10767: "Talk", 10768: "War & Politics"
                };

                const sorted = entries.sort((a, b) => b[1] - a[1]);
                const dominanceThreshold = DOMINANCE_RATIOS[type] || 0.15;
                
                for (const [id, score] of sorted) {
                    if (score >= MIN_ABSOLUTE_SCORE && (score / totalScore) >= dominanceThreshold) {
                        const name = (idNamesMap instanceof Map ? idNamesMap.get(id) : idNamesMap?.[id]) || GENRE_MAP[id] || id;
                        collectorArray.push({ id, type, name, score: Math.round(score * 10) / 10 });
                    }
                }
            };

            const allInferred = [];
            analyzeScores(profile.genreScores, profile.idNames, 'genre', allInferred);
            analyzeScores(profile.keywordScores, profile.idNames, 'keyword', allInferred);
            analyzeScores(profile.countryScores, profile.idNames, 'country', allInferred);

            console.log(`[ProfileBuilder] Analyzed scores. Inferred: ${allInferred.length} traits`);

            let targetGroup = (addonConfig.profiles || []).find(p => p.id === profile.context);
            if (!targetGroup) {
                console.warn(`[ProfileBuilder] Target profile ${profile.context} not found in AddonConfig`);
                return;
            }

            const query = { uuid, 'profiles.id': profile.context };

            const existingManual = targetGroup.settings?.manualDNA || [];
            const existingSuggested = targetGroup.settings?.suggestedDNA || [];
            const existingDNAIds = new Set([
                ...existingManual.map(d => `${d.type}:${d.id}`),
                ...existingSuggested.map(d => `${d.type}:${d.id}`)
            ]);

            const newTraits = allInferred.filter(t => !existingDNAIds.has(`${t.type}:${t.id}`));
            if (newTraits.length === 0) return;

            const onboardingCompleted = profile.onboardingCompleted || false;
            const destField = onboardingCompleted ? 'manualDNA' : 'suggestedDNA';

            const finalUpdateField = `profiles.$.settings.${destField}`;

            console.log(`[ProfileBuilder] New traits for ${profile.context}:`, newTraits.map(t => t.name));
            await AddonConfig.updateOne(query, { $addToSet: { [finalUpdateField]: { $each: newTraits } } });
            console.log(`[ProfileBuilder] DNA ${onboardingCompleted ? 'activated' : 'suggested'} for ${profile.owner} (${profile.context}): ${newTraits.length} traits`);

        } catch (e) {
            console.error(`[ProfileBuilder] DNA Inference Error:`, e.message);
        }
    }
}

module.exports = ProfileBuilder;
