const { fetchTmdbCatalog, createTmdbClient, getTmdbIdByName, getTmdbMovieDetails } = require('../clients/tmdb');
const { rateLimitedMap } = require('../utils/rateLimiter');
const { fetchKitsuCatalog, fetchKitsuEpisodes } = require('../clients/kitsu');
const { fetchTraktCatalog } = require('../clients/trakt');
const { fetchMDBListItems, parseMDBListItems } = require('../utils/mdblist');
const { routeLiveStremioSearch } = require('../ai/router');
const { getHybridCatalog } = require('../engines/hybridRecommendations');
const { getImageKitUrl } = require('../utils/imageProcessor');
const { getProfileDnaFilters } = require('../utils/helpers');
const { normalizeContentId } = require('../utils/contentId');
const {
    interleaveResults,
    interleaveMultipleResults,
    normalizeToUniversalSchema,
    applyConsensusScoring
} = require('../utils/resultMerger');
const UserList = require('../models/UserList');
const TasteProfile = require('../models/TasteProfile');
const UserActivity = require('../models/UserActivity');
const ProfileScorer = require('../profile/ProfileScorer');
const { getPresets } = require('../data/presets');
const {
    CACHE_TTL_MS,
    FAST_CACHE_TTL_MS,
    SLOW_CACHE_TTL_MS,
    PAGES_PER_REQUEST,
    FORCED_FAST_CATALOG_IDS,
    FORCED_FAST_PRESET_IDS,
    FORCED_SLOW_PRESET_IDS
} = require('../config');
const { catalogFallbackCache } = require('../cache/cacheInstances');

const STREAMING_PROVIDERS = { "netflix": 8, "amazon": 119, "prime": 119, "disney": 337, "apple": 350 };
const FORCED_FAST_CATALOGS = new Set(FORCED_FAST_CATALOG_IDS);
const FORCED_FAST_PRESETS = new Set(FORCED_FAST_PRESET_IDS);
const FORCED_SLOW_PRESETS = new Set(FORCED_SLOW_PRESET_IDS);
const MAX_BADGE_CACHE_HYDRATION_ITEMS = 60;
const MERGED_CATALOG_PAGE_SIZE = 20;

// Cache per il flag di fallback persistente (Fase 2.4):
// Quando una query TMDB restituisce < 20 risultati, salviamo i parametri rilassati
// nel CacheManager (Redis + MongoDB) così che le pagine successive usino automaticamente
// gli stessi filtri allargati in modo distribuito.
// Il TTL e la pulizia sono gestiti centralmente dal CacheManager.

// Cataloghi che mostrano episodi recenti (badge numero episodio sul poster)
const EPISODE_CATALOG_IDS = new Set([
    'preset_new_series_eps',
    'preset_new_anime_eps',
    'yaca_anime_trending',
    'yaca_discover_series',
    'yaca_trakt_filtered_series'
]);

async function hydrateEpisodeBadgesFromCache(metas, tmdbApiKey) {
    if (!tmdbApiKey || !Array.isArray(metas) || metas.length === 0) return;

    await Promise.all(
        metas.slice(0, MAX_BADGE_CACHE_HYDRATION_ITEMS).map(async (item) => {
            if (!item?.id || item.rawTMDB || !item.id.startsWith('tmdb:')) return;

            try {
                const tmdbId = normalizeContentId(item.id);
                const cachedDetails = await getTmdbMovieDetails(tmdbApiKey, tmdbId, 'tv', { cacheOnly: true });
                if (cachedDetails) {
                    item.rawTMDB = cachedDetails;
                    return;
                }

                getTmdbMovieDetails(tmdbApiKey, tmdbId, 'tv').catch((err) => {
                    console.debug(`[BadgeBackground] Cache warmup fallita per ${tmdbId}: ${err?.message || 'Unknown error'}`);
                });
            } catch (_err) {
                // Il recupero badge è best-effort: in caso di errore manteniamo il poster originale.
            }
        })
    );
}

function getEpisodeBadgeText(item) {
    if (!item?.poster) return null;

    if (item.rawTMDB && (item.type === 'series' || item.type === 'anime')) {
        const nextEp = item.rawTMDB.next_episode_to_air;
        const lastEp = item.rawTMDB.last_episode_to_air;
        const isEnded = item.rawTMDB.status === 'Ended' || item.rawTMDB.status === 'Canceled';

        if (nextEp?.episode_number) {
            return `S${nextEp.season_number || 1} E${nextEp.episode_number}`;
        }

        if (lastEp?.episode_number && !isEnded) {
            return `S${lastEp.season_number || 1} E${lastEp.episode_number}`;
        }
    }

    if (!Array.isArray(item.videos) || item.videos.length === 0) return null;

    const now = new Date();
    const airedEpisodes = item.videos.filter(v => v.released && new Date(v.released) <= now);
    if (airedEpisodes.length === 0) return null;

    airedEpisodes.sort((a, b) => new Date(b.released) - new Date(a.released));
    const latest = airedEpisodes[0];
    const isKitsu = item.id && (item.id.startsWith('kitsu:') || item.id.includes(':absolute:'));
    const season = latest.season || 0;
    const episode = latest.episode || 1;

    return (isKitsu || season <= 1)
        ? `Ep ${episode}`
        : `S ${season} Ep ${episode}`;
}

function sanitizeCatalogMeta(item, shouldApplyEpisodeBadge = false, imageKitId) {
    if (!item) return item;

    const badgeText = shouldApplyEpisodeBadge ? getEpisodeBadgeText(item) : null;

    // In catalogHandler, item.poster is already a full TMDB URL (e.g., https://image.tmdb.org/t/p/w342/...)
    // because it comes from fetchTmdbCatalog. 
    // ImageKit expects the full path after the ID.
    const poster = (typeof item.poster === 'string' && item.poster.length > 0)
        ? getImageKitUrl(item.poster, badgeText, imageKitId)
        : item.poster;

    return {
        id: item.id,
        type: item.type,
        name: item.name,
        poster,
        posterShape: item.posterShape || 'poster',
        background: item.background,
        description: item.description,
        releaseInfo: item.releaseInfo,
        imdbRating: item.imdbRating,
        genres: item.genres,
        behaviorHints: item.behaviorHints
    };
}

async function finalizeCatalog(results, id, type, hostUrl, userConfig) {
    if (!Array.isArray(results)) return { metas: [] };

    const tmdbApiKey = userConfig?.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    const imageKitId = userConfig?.apiKeys?.imagekit || process.env.IMAGEKIT_ID;
    const baseId = (id || '').startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : (id || '');
    const shouldApplyEpisodeBadge = type === 'series' && EPISODE_CATALOG_IDS.has(baseId);

    if (shouldApplyEpisodeBadge) {
        await hydrateEpisodeBadgesFromCache(results, tmdbApiKey);
    }

    return {
        metas: results.map(item => sanitizeCatalogMeta(item, shouldApplyEpisodeBadge, imageKitId))
    };
}

async function hydrateResultsFromLocalDetailsCache(metas, tmdbApiKey, type) {
    if (!tmdbApiKey || !Array.isArray(metas) || metas.length === 0) return;

    const tmdbType = type === 'series' ? 'tv' : 'movie';
    const itemsToHydrate = metas.slice(0, 60).filter(item => item && item.id && !item.rawTMDB && !(item.cast && item.keywords));
    if (itemsToHydrate.length === 0) return;

    const tmdbIds = itemsToHydrate.map(item => normalizeContentId(item.id)).filter(Boolean);

    // Fase 1: Bulk query su TmdbScoringData per evitare N chiamate individuali
    let scoringMap = new Map();
    try {
        const TmdbScoringData = require('../models/TmdbScoringData');
        const cachedDocs = await TmdbScoringData.find({ tmdbId: { $in: tmdbIds }, type: tmdbType }).lean();
        for (const doc of cachedDocs) {
            scoringMap.set(String(doc.tmdbId), doc);
        }
    } catch (_e) { /* TmdbScoringData miss is non-blocking */ }

    // Fase 2: Idratta i risultati, con fallback individuale solo per i miss
    await Promise.all(
        itemsToHydrate.map(async (item) => {
            try {
                const tmdbId = normalizeContentId(item.id);
                const scoringDoc = scoringMap.get(tmdbId);

                if (scoringDoc) {
                    // Ricostruisci un oggetto compatibile con ProfileScorer dalla scoring cache
                    item.rawTMDB = {
                        id: scoringDoc.tmdbId,
                        genre_ids: scoringDoc.genre_ids,
                        vote_average: scoringDoc.vote_average,
                        vote_count: scoringDoc.vote_count,
                        keywords: { keywords: scoringDoc.keyword_ids.map(id => ({ id })) },
                        credits: {
                            crew: scoringDoc.director_ids.map(id => ({ id, job: 'Director' })),
                            cast: scoringDoc.cast_ids.map(id => ({ id }))
                        }
                    };
                    item.keywords = item.rawTMDB.keywords.keywords;
                    item.cast = item.rawTMDB.credits.cast;
                    return;
                }

                // Fallback: chiamata individuale alla cache TMDB per i titoli sconosciuti
                const cachedDetails = await getTmdbMovieDetails(tmdbApiKey, String(tmdbId), tmdbType, { cacheOnly: true });
                if (!cachedDetails) return;

                item.rawTMDB = cachedDetails;
                item.keywords = cachedDetails.keywords?.keywords || cachedDetails.keywords?.results || [];
                item.cast = cachedDetails.credits?.cast || [];
            } catch (_err) {
                // Il recupero cache è best-effort: in caso di errore si continua con i dati Light Mode.
            }
        })
    );
}

/**
 * Filtra i contenuti già visti dall'utente se l'opzione è attiva (Fase 10).
 * @param {Array} metas Lista dei contenuti da filtrare
 * @param {Object} userConfig Configurazione dell'utente
 * @returns {Promise<Array>} Lista filtrata
 */
async function filterWatchedItems(metas, userConfig) {
    if (!metas || metas.length === 0 || !userConfig?.config?.hideWatched) {
        return metas;
    }

    const userId = userConfig.userId;
    // Carichiamo il profilo globale per avere la history completa (Trakt + Stremio)
    const profile = await TasteProfile.findOne({ owner: userId, context: 'global' });
    if (!profile) return metas;

    const watchedIds = new Set([
        ...(profile.processedTraktIds || []),
        ...(profile.processedStremioIds || [])
    ].map(normalizeContentId));

    if (watchedIds.size === 0) return metas;

    return metas.filter(item => {
        // Estraiamo l'ID TMDB puro (es. 'tmdb:123' -> '123')
        const rawId = normalizeContentId(item.id);
        return !watchedIds.has(rawId);
    });
}

function getCatalogCacheTtlMs(catalogId, profileSettings = {}) {
    if (FORCED_FAST_CATALOGS.has(catalogId)) return FAST_CACHE_TTL_MS;
    if (!catalogId.startsWith('yaca_preset_')) return CACHE_TTL_MS;

    const presetId = catalogId.replace('yaca_preset_', '');
    if (FORCED_FAST_PRESETS.has(presetId)) return FAST_CACHE_TTL_MS;
    if (FORCED_SLOW_PRESETS.has(presetId)) return SLOW_CACHE_TTL_MS;
    if (profileSettings.fastPresetRefresh) return FAST_CACHE_TTL_MS;
    return CACHE_TTL_MS;
}

/**
 * Mappa i generi. Se type è TV Series, TMDB ha ID diversi rispetto ai film.
 * Di base, l'AI è istruita per ritornare ID film. Se cerchiamo TV, li mappiamo.
 */
function resolveGenreIds(genreIdsArray, type) {
    if (!genreIdsArray || genreIdsArray.length === 0) return '';
    if (type === 'movie') return genreIdsArray.join('|');

    const MOVIE_TO_TV_MAP = {
        28: 10759, 12: 10759, 16: 16, 35: 35, 80: 80, 99: 99, 18: 18,
        10751: 10751, 14: 10765, 36: 10768, 27: 10765, 10402: 18,
        9648: 9648, 10749: 18, 878: 10765, 53: 80, 10752: 10768, 37: 37
    };

    const mapped = genreIdsArray.map(id => MOVIE_TO_TV_MAP[id]).filter(id => id !== undefined);
    return [...new Set(mapped)].join('|');
}

/**
 * Traduce l'oggetto filtri AI (o salvato a DB) in un oggetto query params per TMDB /discover
 */
async function buildDiscoveryParams(filters, tmdbApiKey, type, baseSettings = {}) {
    const tmdbParams = {
        ...filters, // Spread per far passare le chiavi TMDB dirette usate nei preset
        sort_by: filters.sort_by || 'popularity.desc',
        'vote_count.gte': filters['vote_count.gte'] !== undefined ? filters['vote_count.gte'] : (parseInt(baseSettings.minVoteCount) || 0),
        'vote_average.gte': filters['vote_average.gte'] !== undefined ? filters['vote_average.gte'] : (parseFloat(baseSettings.minVoteAverage) || 0),
        'vote_count.lte': filters['vote_count.lte'],
        'vote_average.lte': filters['vote_average.lte'],
        'popularity.lte': filters['popularity.lte'],
        language: filters.language || 'it-IT'
    };

    if (filters.original_language) {
        tmdbParams.with_original_language = filters.original_language;
    }

    // Pulisci le chiavi custom dell'AI per non inviarle sporche a TMDB (opzionale ma pulito)
    delete tmdbParams.strategy;
    delete tmdbParams.similar_to;
    delete tmdbParams.text_search;
    delete tmdbParams.people_list;
    delete tmdbParams.keyword;
    delete tmdbParams.company_name;
    delete tmdbParams.genre_ids;
    delete tmdbParams.year_from;
    delete tmdbParams.year_to;
    delete tmdbParams.runtime_lte;
    delete tmdbParams.runtime_gte;
    delete tmdbParams.watch_provider;
    delete tmdbParams.original_language;
    delete tmdbParams.target;

    if (tmdbParams.with_genres !== undefined && tmdbParams.with_genres !== null) {
        const normalizedGenres = Array.isArray(tmdbParams.with_genres)
            ? tmdbParams.with_genres.map(String)
            : String(tmdbParams.with_genres).split(/[|,]/).map(g => g.trim()).filter(Boolean);
        if (normalizedGenres.length > 0) tmdbParams.with_genres = [...new Set(normalizedGenres)].join('|');
    }

    if (tmdbParams.with_keywords !== undefined && tmdbParams.with_keywords !== null) {
        const kwStr = String(tmdbParams.with_keywords);
        // Rileva il separatore originale: se contiene pipe usa OR, altrimenti AND (virgola)
        const kwIsOr = kwStr.includes('|');
        const kwSeparator = kwIsOr ? '|' : ',';
        const normalizedKeywords = Array.isArray(tmdbParams.with_keywords)
            ? tmdbParams.with_keywords.map(String)
            : kwStr.split(kwIsOr ? '|' : ',').map(k => k.trim()).filter(Boolean);
        if (normalizedKeywords.length > 0) tmdbParams.with_keywords = [...new Set(normalizedKeywords)].join(kwSeparator);
    }

    if (filters.genre_ids?.length) {
        const finalGenres = resolveGenreIds(filters.genre_ids, type);
        if (finalGenres) tmdbParams.with_genres = finalGenres;
    }

    if (filters.year_from) {
        const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
        tmdbParams[`${dateField}.gte`] = `${filters.year_from}-01-01`;
        if (filters.year_to) tmdbParams[`${dateField}.lte`] = `${filters.year_to}-12-31`;
    }

    if (filters.runtime_lte && type === 'movie') tmdbParams['with_runtime.lte'] = filters.runtime_lte;
    if (filters.runtime_gte && type === 'movie') tmdbParams['with_runtime.gte'] = filters.runtime_gte;

    // Risoluzione ID Asincrona: Persone, Keywords, Compagnie — in parallelo
    const asyncTasks = [];

    if (filters.people_list && filters.people_list.length > 0) {
        asyncTasks.push(
            Promise.allSettled(filters.people_list.map(name => getTmdbIdByName(tmdbApiKey, 'person', name)))
                .then(results => {
                    const valid = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
                    if (valid.length > 0) tmdbParams.with_people = valid.join(',');
                })
        );
    }

    if (filters.keyword && filters.keyword !== 'kdrama') {
        // Sanitizzazione: se la stringa contiene pipe (OR), forza tutte le virgole a pipe (e viceversa)
        // Questo previene corruzione quando Mistral mescola separatori nella stessa stringa
        let sanitizedKeyword = filters.keyword;
        if (sanitizedKeyword.includes('|') && sanitizedKeyword.includes(',')) {
            // Mixed separators detected — normalize to pipe (OR) since pipe was the primary intent
            sanitizedKeyword = sanitizedKeyword.replace(/,/g, '|');
        }

        // Rileva se Mistral ha usato OR (|) o AND (,)
        const isOr = sanitizedKeyword.includes('|');
        const separator = isOr ? '|' : ',';

        const keywords = sanitizedKeyword.split(separator).map(k => k.trim()).filter(Boolean);
        asyncTasks.push(
            Promise.allSettled(keywords.map(k => getTmdbIdByName(tmdbApiKey, 'keyword', k)))
                .then(results => {
                    const valid = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
                    // Unisce gli ID numerici usando lo STESSO separatore scelto dall'AI
                    if (valid.length > 0) tmdbParams.with_keywords = valid.join(separator);
                })
        );
    }

    if (filters.company_name) {
        asyncTasks.push(
            getTmdbIdByName(tmdbApiKey, 'company', filters.company_name)
                .then(cid => { if (cid) tmdbParams.with_companies = cid; })
        );
    }

    await Promise.all(asyncTasks);

    // Provider (Netflix, ecc.)
    if (filters.watch_provider) {
        const pid = STREAMING_PROVIDERS[filters.watch_provider.toLowerCase()];
        if (pid) {
            tmdbParams.with_watch_providers = pid;
            tmdbParams.watch_region = 'IT';
        }
    }

    return tmdbParams;
}

/**
 * Esegue una query complessa determinando la strategia (similar, discovery, search)
 */
async function executeComplexStrategy(filters, tmdbClient, tmdbApiKey, type, skip, settings = {}, cacheOptions = {}) {
    let results = [];
    const searchType = type === 'series' ? 'tv' : 'movie';

    // === STRATEGIA 1: SIMILARITÀ ===
    if (filters.strategy === "similar" && filters.similar_to) {
        const targetId = await getTmdbIdByName(tmdbApiKey, searchType, filters.similar_to);
        if (targetId) {
            results = await fetchTmdbCatalog(
                tmdbClient,
                `/${searchType}/${targetId}/recommendations`,
                skip,
                { language: 'it-IT' },
                type,
                cacheOptions
            );
        }
    }
    // === STRATEGIA 2: RICERCA DIRETTA (Titoli esatti) ===
    else if (filters.strategy === "multi_search") {
        const ep = type === 'movie' ? '/search/movie' : '/search/tv';
        results = await fetchTmdbCatalog(tmdbClient, ep, skip, { query: filters.text_search || filters.keyword }, type, cacheOptions);
    }
    // === STRATEGIA 3: DISCOVERY (Filtri) ===
    else {
        const tmdbParams = await buildDiscoveryParams(filters, tmdbApiKey, type, settings);
        const endpoint = `/discover/${searchType}`;

        // === FALLBACK PERSISTENTE (Fase 2.4) ===
        // Il fallback non dipende più dallo skip. Usa il CacheManager per sapere
        // se questa specifica query richiede parametri rilassati.
        const paramsKey = JSON.stringify(tmdbParams);
        const fallbackFlag = await catalogFallbackCache.get(paramsKey);

        if (fallbackFlag) {
            // Applica automaticamente i filtri allargati salvati in precedenza
            results = await fetchTmdbCatalog(tmdbClient, endpoint, skip, fallbackFlag.relaxedParams, type, cacheOptions);
        } else {
            results = await fetchTmdbCatalog(tmdbClient, endpoint, skip, tmdbParams, type, cacheOptions);

            // Se la prima chiamata restituisce pochi risultati, prova a rilassare i filtri
            // e salva il flag per le pagine successive
            if (results.length < 20) {
                let relaxedParams = { ...tmdbParams };
                let changed = false;

                // Step 1: Abbassa il limite dei voti (vote_count.gte)
                if (relaxedParams['vote_count.gte'] > 5) {
                    relaxedParams['vote_count.gte'] = 5;
                    changed = true;
                } else if (relaxedParams['vote_count.gte'] > 0) {
                    relaxedParams['vote_count.gte'] = 0;
                    changed = true;
                }

                if (changed) {
                    const extraResults = await fetchTmdbCatalog(tmdbClient, endpoint, skip, relaxedParams, type, cacheOptions);
                    // Unione e deduplicazione manuale per ID
                    const existingIds = new Set(results.map(r => normalizeContentId(r.id)));
                    for (const item of extraResults) {
                        const normalizedItemId = normalizeContentId(item.id);
                        if (!existingIds.has(normalizedItemId)) {
                            results.push(item);
                            existingIds.add(normalizedItemId);
                        }
                    }
                }

                // Step 2: Se ancora pochi risultati, rimuovi le keyword ma tieni i generi
                if (results.length < 20 && relaxedParams.with_keywords) {
                    delete relaxedParams.with_keywords;
                    const broadResults = await fetchTmdbCatalog(tmdbClient, endpoint, skip, relaxedParams, type, cacheOptions);
                    const existingIds = new Set(results.map(r => normalizeContentId(r.id)));
                    for (const item of broadResults) {
                        const normalizedItemId = normalizeContentId(item.id);
                        if (!existingIds.has(normalizedItemId)) {
                            results.push(item);
                            existingIds.add(normalizedItemId);
                        }
                    }
                    changed = true; // Mark as changed if keywords were removed
                }

                // Salva il flag di fallback in cache distribuita
                if (changed) {
                    await catalogFallbackCache.set(paramsKey, { relaxedParams });
                }
            }
        }
    }

    // Metadati originali per supporto interleave
    const originalResults = results;
    return results;
}

/**
 * Universal Execution Pipeline (Fase 2):
 * Processa qualsiasi catalogo attraverso il suo array `queries`, applicando:
 * - Look-ahead Fetching (3 pagine per blocco sulla prima richiesta)
 * - Consenso Universale (bonus per item che appaiono in più query)
 * - Paginazione Orizzontale Dinamica basata su presentation_strategy
 */
async function executeUniversalPipeline(universalCatalog, tmdbClient, tmdbApiKey, type, skip, settings, cacheOptions) {
    const { presentation_strategy } = universalCatalog;
    // Safety limit: cap the number of queries to prevent DoS from unbounded arrays
    const MAX_QUERIES = 10;
    const queries = (universalCatalog.queries || []).slice(0, MAX_QUERIES);

    if (queries.length === 0) return [];

    // Single-query fast path: no consensus needed, direct execution
    if (queries.length === 1) {
        const query = { ...queries[0] };
        if (!query.strategy) query.strategy = 'discovery';
        return executeComplexStrategy(query, tmdbClient, tmdbApiKey, type, skip, settings, cacheOptions);
    }

    // Multi-query path: Look-ahead + Consensus
    const isFirstPage = skip === 0;

    // Compute pagination offsets based on strategy
    let perQuerySkip;
    if (presentation_strategy === 'interleave') {
        perQuerySkip = Math.floor(skip / queries.length);
    } else {
        perQuerySkip = skip;
    }

    // Unified consensus pool execution
    const queryResults = await Promise.all(
        queries.map(async (queryDef) => {
            const query = { ...queryDef };
            if (!query.strategy) query.strategy = 'discovery';

            const pagesToFetch = isFirstPage ? LOOKAHEAD_PAGES : 1;
            const pagePromises = [];
            for (let p = 0; p < pagesToFetch; p++) {
                const pageSkip = perQuerySkip + (p * PAGE_SIZE);
                pagePromises.push(
                    executeComplexStrategy(query, tmdbClient, tmdbApiKey, type, pageSkip, settings, cacheOptions)
                );
            }
            const pageResults = await Promise.all(pagePromises);
            return pageResults.flat();
        })
    );

    if (presentation_strategy === 'interleave') {
        return interleaveMultipleResults(queryResults, PAGE_SIZE);
    }

    const finalItems = applyConsensusScoring(queryResults);
    
    // Popularity sort by consensus + popularity
    finalItems.sort((a, b) => {
        const bonusDiff = (b.consensusBonus || 0) - (a.consensusBonus || 0);
        if (bonusDiff !== 0) return bonusDiff;
        return (b.popularity || 0) - (a.popularity || 0);
    });

    return finalItems.slice(0, PAGE_SIZE);
}



async function rerankMergedPage(results, profileDoc, globalProfileDoc, tmdbApiKey, type, dnaFilters = []) {
    if (!profileDoc || !Array.isArray(results) || results.length === 0) return results;

    await hydrateResultsFromLocalDetailsCache(results, tmdbApiKey, type);
    return [...results]
        .map((item, index) => {
            const affinity = ProfileScorer.calculateItemMatch(item.rawTMDB || item, profileDoc, {
                globalProfile: globalProfileDoc,
                dnaFilters
            });
            return {
                item,
                affinity,
                finalScore: affinity + ((item.popularity || 0) / 1000),
                index
            };
        })
        .sort((a, b) => {
            if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
            if ((b.item.popularity || 0) !== (a.item.popularity || 0)) return (b.item.popularity || 0) - (a.item.popularity || 0);
            return a.index - b.index;
        })
        .map(entry => entry.item);
}

/**
 * Arricchisce i filtri con le preferenze del profilo utente (Automatic Query Injection).
 */
async function injectProfilePreferences(filters, userId, profileId) {
    if (!userId) return filters;
    const profile = await TasteProfile.findOne({ owner: userId, context: profileId || 'global' });
    if (!profile) return filters;

    const enriched = { ...filters };

    // Estrai top 3 keyword e top 2 generi dal profilo
    const topKeywords = [...profile.keywordScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(e => e[0]);

    const topGenres = [...profile.genreScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(e => e[0]);

    if (topKeywords.length > 0) {
        const existingKws = enriched.with_keywords ? enriched.with_keywords.split(/[|,]/) : [];
        enriched.with_keywords = [...new Set([...existingKws, ...topKeywords])].join('|');
    }

    if (topGenres.length > 0) {
        const existingGenres = enriched.with_genres ? enriched.with_genres.split(/[|,]/) : [];
        enriched.with_genres = [...new Set([...existingGenres, ...topGenres])].join('|');
    }

    return enriched;
}

/**
 * Esegue la ricerca standard TMDB senza AI né ricalcolo semantico.
 */
async function executeStandardSearch(search, userConfig, type, skip, cacheOptions) {
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    const tmdbClient = createTmdbClient(tmdbApiKey);
    const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
    return fetchTmdbCatalog(tmdbClient, endpoint, skip, { query: search }, type, cacheOptions);
}

function getTmdbVoteScore(item) {
    const rawVote = item?.rawTMDB?.vote_average ?? item?.vote_average ?? item?.imdbRating;
    const vote = Number.parseFloat(rawVote);
    return Number.isFinite(vote) ? vote : 0;
}

/**
 * Esegue la Deep AI Search tramite query planner, consensus ranking e profilazione finale.
 */
async function executeCombinedSearch(search, userConfig, type, skip, activeProfileSettings, cacheOptions) {
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    const mistralKey = userConfig.apiKeys?.mistral || process.env.MISTRAL_API_KEY;
    const tmdbClient = createTmdbClient(tmdbApiKey);
    const userId = userConfig.userId;
    const profileId = userConfig.activeProfileId;
    const activeContext = profileId || 'global';
    let profileDoc = null;
    let globalProfileDoc = null;
    if (userId) {
        [profileDoc, globalProfileDoc] = await Promise.all([
            TasteProfile.findOne({ owner: userId, context: activeContext }),
            activeContext === 'global' ? Promise.resolve(null) : TasteProfile.findOne({ owner: userId, context: 'global' })
        ]);
    }
    const dnaFilters = getProfileDnaFilters(userConfig, activeContext);

    let plannedQueries = [];
    try {
        if (mistralKey) {
            const routing = await routeLiveStremioSearch(search, mistralKey);
            const rawQueries = Array.isArray(routing?.filters?.queries) ? routing.filters.queries : [];
            plannedQueries = rawQueries.filter(query => !query?.target || query.target === 'tmdb');
        }
    } catch (e) {
        console.error("Errore AI Search (Mistral down):", e.message);
    }

    if (plannedQueries.length === 0) {
        plannedQueries = [{ strategy: 'multi_search', text_search: search, target: 'tmdb' }];
    }

    const enrichedQueries = await Promise.all(
        plannedQueries.map(query => injectProfilePreferences(query, userId, profileId))
    );
    const queryResults = await Promise.all(
        enrichedQueries.map(query =>
            executeComplexStrategy(query, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings, cacheOptions)
        )
    );

    const mergedMap = new Map();
    queryResults.forEach((items, queryIndex) => {
        for (const item of items || []) {
            if (!item || !item.id) continue;
            const normalizedItemId = normalizeContentId(item.id);
            if (mergedMap.has(normalizedItemId)) {
                const existing = mergedMap.get(normalizedItemId);
                existing.consensusCount += 1;
                existing.queryIndexes.add(queryIndex);
            } else {
                mergedMap.set(normalizedItemId, {
                    ...item,
                    consensusCount: 1,
                    queryIndexes: new Set([queryIndex])
                });
            }
        }
    });

    let finalItems = Array.from(mergedMap.values());
    await hydrateResultsFromLocalDetailsCache(finalItems, tmdbApiKey, type);

    for (const item of finalItems) {
        const consensusBonus = item.consensusCount > 1 ? (item.consensusCount ** 2) - 1 : 0;
        const tmdbVote = getTmdbVoteScore(item);
        if (profileDoc) {
            const affinity = ProfileScorer.calculateItemMatch(item.rawTMDB || item, profileDoc, {
                globalProfile: globalProfileDoc,
                dnaFilters
            });
            item.affinity = affinity;
            item.finalScore = tmdbVote + consensusBonus + affinity;
        } else {
            item.affinity = 0;
            item.finalScore = tmdbVote + consensusBonus;
        }
        item.consensusBonus = consensusBonus;
        delete item.queryIndexes;
    }

    finalItems.sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        if ((b.popularity || 0) !== (a.popularity || 0)) return (b.popularity || 0) - (a.popularity || 0);
        return (b.consensusCount || 0) - (a.consensusCount || 0);
    });

    return finalItems.slice(0, 20);
}

/**
 * Gestisce la rotta "catalog" inviata da Stremio (es. /catalog/movie/tmdb_discover.json)
 */
async function catalogHandler(args, userConfig, hostUrl) {
    try {
        const { type, id, extra, filters: directFilters, useRam } = args;
        const skip = extra.skip || 0;
        const search = extra.search || null;
        const sortBy = extra.sortBy || null;

        let results = [];

        // Preview mode: minimal userConfig if missing
        const effectiveUserConfig = userConfig || { apiKeys: { tmdb: process.env.TMDB_API_KEY, mistral: process.env.MISTRAL_API_KEY } };

        const tmdbApiKey = effectiveUserConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
        if (!tmdbApiKey) throw new Error("TMDB API key mancante");

        const mistralKey = effectiveUserConfig.apiKeys?.mistral || process.env.MISTRAL_API_KEY;
        const tmdbClient = createTmdbClient(tmdbApiKey);

        // Recupera impostazioni del profilo attivo
        let activeProfileSettings = { minVoteAverage: 0, minVoteCount: 0 };
        let profileDoc = null;
        let globalProfileDoc = null;
        const activeDnaFilters = getProfileDnaFilters(userConfig, userConfig?.activeProfileId);
        if (userConfig.profiles && userConfig.activeProfileId) {
            [profileDoc, globalProfileDoc] = await Promise.all([
                TasteProfile.findOne({ owner: userConfig.userId, context: userConfig.activeProfileId }),
                userConfig.activeProfileId === 'global'
                    ? Promise.resolve(null)
                    : TasteProfile.findOne({ owner: userConfig.userId, context: 'global' })
            ]);
            if (profileDoc && profileDoc.settings) {
                activeProfileSettings = profileDoc.settings;
            }
        }
        const cacheOptions = {
            cacheTtlMs: getCatalogCacheTtlMs(id || 'preview', activeProfileSettings),
            useRam: useRam !== undefined ? useRam : true
        };

        // Pulisce l'ID nel caso arrivi come Preset dalla Dashboard
        const baseId = (id || '').startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : (id || '');
        const tmdbFetchOptions = {
            ...cacheOptions,
            disableLightMode: type === 'series' && EPISODE_CATALOG_IDS.has(baseId)
        };

        // Carica i preset con date dinamiche (ricalcolate ad ogni richiesta)
        const presetsList = getPresets();

        // Risoluzione metadati catalogo (Preset o Lista Utente)
        let catalogMeta = presetsList.find(p => p.id === baseId);
        if (!catalogMeta) {
            // Se non è un preset hardcoded, cerchiamo nelle liste personalizzate dell'utente (AI o manuali)
            catalogMeta = await UserList.findOne({ listId: id }).lean();
        }

        // ==========================================
        // SCENARIO -1: YACA PROFILES
        // ==========================================
        if (id === 'yaca-profiles') {
            if (!userConfig.profiles || userConfig.profiles.length === 0) {
                return { metas: [] };
            }
            const profilesMeta = userConfig.profiles.map(p => {
                const isActive = p.id === userConfig.activeProfileId;
                const displayName = isActive ? `✅ ${p.name}` : p.name;
                return {
                    id: `yaca-profile-${p.id}`,
                    type: args.type || 'other',
                    name: displayName,
                    poster: `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random&color=fff&size=512`,
                    description: isActive ? 'Profilo attualmente attivo' : 'Seleziona per impostare come Profilo Attivo'
                };
            });
            return { metas: profilesMeta };
        }

        // ==========================================
        // SCENARIO 0: CRONOLOGIA RICERCHE (New)
        // ==========================================
        if (baseId === 'yaca_search_history') {
            const lastActivities = await UserActivity.find({
                userId: userConfig.userId,
                type: 'search'
            }).sort({ timestamp: -1 }).limit(3).lean();

            if (lastActivities.length > 0) {
                const searchTasks = lastActivities.map(act =>
                    executeCombinedSearch(act.value, userConfig, type, 0, activeProfileSettings, tmdbFetchOptions)
                );
                const searchResults = await Promise.all(searchTasks);
                results = searchResults.flat();

                // Deduplica e applica ranking profilo
                const seen = new Set();
                results = results.filter(item => {
                    const normalizedItemId = normalizeContentId(item.id);
                    if (seen.has(normalizedItemId)) return false;
                    seen.add(normalizedItemId);
                    return true;
                });

            }
            // Applica la paginazione corretta sulla history locale
            return { metas: results.slice(skip, skip + 20) };
        }

        // ==========================================
        // SCENARIO 1: RICERCA VIVA TRAMITE BARRA
        // ==========================================
        if (search) {
            // Track activity
            if (userConfig.userId) {
                UserActivity.create({
                    userId: userConfig.userId,
                    type: 'search',
                    value: search,
                    metadata: { type, id }
                }).catch(e => console.error('Errore tracking search:', e.message));
            }

            const STANDARD_SEARCH_IDS = new Set(['yaca_search_standard']);
            if (STANDARD_SEARCH_IDS.has(baseId)) {
                results = await executeStandardSearch(search, userConfig, type, skip, tmdbFetchOptions);
                return finalizeCatalog(results, id, type, hostUrl);
            }

            let currentSkip = skip;
            let combinedResults = [];

            const parallelPages = (userConfig?.config?.hideWatched) ? 3 : 1;
            const pagesResults = await rateLimitedMap(
                Array.from({ length: parallelPages }, (_, i) => i),
                (i) => executeCombinedSearch(search, userConfig, type, currentSkip + (i * 20), activeProfileSettings, tmdbFetchOptions),
                { batchSize: 3, delayMs: 50 }
            );
            for (let pageResults of pagesResults) {
                pageResults = await filterWatchedItems(pageResults, userConfig);
                combinedResults.push(...pageResults);
                if (combinedResults.length >= 20) break;
            }
            results = combinedResults.slice(0, 20);
            return finalizeCatalog(results, id, type, hostUrl);
        }

        // ==========================================
        // SCENARIO 2: CATALOGHI ESPLORATIVI STANDARD
        // ==========================================
        if (id === 'yaca_discover_movies' || id === 'yaca_discover_series') {
            const isMovie = id === 'yaca_discover_movies';
            const endpoint = isMovie ? '/discover/movie' : '/discover/tv';
            const contentType = isMovie ? 'movie' : 'series';
            const tmdbType = isMovie ? 'movie' : 'tv';

            let currentSkip = skip;
            let combinedResults = [];

            const params = {
                sort_by: sortBy || 'popularity.desc',
                'vote_average.gte': activeProfileSettings.minVoteAverage,
                'vote_count.gte': activeProfileSettings.minVoteCount
            };

            const parallelPages = (userConfig?.config?.hideWatched) ? 3 : 1;
            const pagesResults = await rateLimitedMap(
                Array.from({ length: parallelPages }, (_, i) => i),
                (i) => fetchTmdbCatalog(tmdbClient, endpoint, currentSkip + (i * 20), params, contentType, tmdbFetchOptions),
                { batchSize: 3, delayMs: 50 }
            );
            for (let pageResults of pagesResults) {
                pageResults = await filterWatchedItems(pageResults, userConfig);
                combinedResults.push(...pageResults);
                if (combinedResults.length >= 20) break;
            }

            results = combinedResults.slice(0, 40);
            return finalizeCatalog(results, id, type, hostUrl);
        }

        if (id === 'yaca_anime_trending') {
            results = await fetchKitsuCatalog('/anime', skip, { sort: '-popularityRank' });
            await rateLimitedMap(
                results,
                async (item) => {
                    const kitsuId = item?.id?.replace('kitsu:', '');
                    if (!kitsuId) return;
                    const episodes = await fetchKitsuEpisodes(kitsuId);
                    item.videos = episodes || [];
                },
                { batchSize: 3, delayMs: 100 }
            );
            return finalizeCatalog(results, id, 'series', hostUrl);
        }

        // ==========================================
        // SCENARIO 2.5: CATALOGHI IBRIDI (Hybrid Recommendations - Taste-Based)
        // ==========================================
        const TASTE_BASED_IDS = new Set([
            // Hero Catalogs (Phase 4)
            'yaca_true_blend_movies', 'yaca_true_blend_series',
            'yaca_seed_network_movies', 'yaca_seed_network_series',
            'yaca_hidden_gems_movies', 'yaca_hidden_gems_series',
            'yaca_trakt_filtered_movies', 'yaca_trakt_filtered_series',
            // Legacy / backward compatibility
            'yaca_signature_core_movies', 'yaca_signature_core_series',
            'yaca_signature_blend_movies', 'yaca_signature_blend_series',
            'yaca_signature_star_movies', 'yaca_signature_star_series',
            'yaca_hybrid_movies', 'yaca_hybrid_series',
            'yaca_discovery_movies', 'yaca_discovery_series',
            'yaca_top20_movies', 'yaca_top20_series',
            'yaca_top_genres_mix'
        ]);
        if (TASTE_BASED_IDS.has(baseId)) {
            const traktToken = userConfig.apiKeys?.trakt;
            let currentSkip = skip;
            let combinedResults = [];

            const parallelPages = (userConfig?.config?.hideWatched) ? 3 : 1;
            const promises = [];
            for (let i = 0; i < parallelPages; i++) {
                promises.push(getHybridCatalog(baseId, currentSkip + (i * 20), traktToken, tmdbApiKey, userConfig.userId, userConfig.activeProfileId));
            }

            const pagesResults = await Promise.all(promises);
            for (let pageResults of pagesResults) {
                pageResults = await filterWatchedItems(pageResults, userConfig);
                combinedResults.push(...pageResults);
                if (combinedResults.length >= 20) break;
            }
            results = combinedResults.slice(0, 20);
            return await finalizeCatalog(results, id, type, hostUrl, userConfig);
        }

        // ==========================================
        // SCENARIO 2.6: IBRIDO POPOLARI (TMDB + Trakt fusi e deduplicati)
        // ==========================================
        if (baseId === 'yaca_hybrid_popular_movies' && type === 'movie' || baseId === 'yaca_hybrid_popular_series' && type === 'series') {
            const isMovie = type === 'movie';
            const tmdbEp = isMovie ? '/discover/movie' : '/discover/tv';
            const traktEp = isMovie ? 'popular_movies' : 'popular_shows';
            const contentType = isMovie ? 'movie' : 'series';

            let combinedResults = [];
            const MAX_DEPTH = Math.max(PAGES_PER_REQUEST, 3);
            const pageSkips = (userConfig?.config?.hideWatched)
                ? Array.from({ length: MAX_DEPTH }, (_, i) => skip + (i * 20))
                : [skip];

            const pagesResults = await Promise.all(pageSkips.map((pageSkip) =>
                Promise.all([
                    fetchTmdbCatalog(tmdbClient, tmdbEp, pageSkip, { sort_by: 'popularity.desc', 'vote_count.gte': 50 }, contentType, tmdbFetchOptions),
                    fetchTraktCatalog(traktEp, pageSkip, null, tmdbApiKey).catch(() => [])
                ])
            ));

            for (const [tmdbResults, traktResults] of pagesResults) {
                const seen = new Set();
                let merged = [...tmdbResults, ...traktResults].filter(item => {
                    const normalizedItemId = normalizeContentId(item.id);
                    if (seen.has(normalizedItemId)) return false;
                    seen.add(normalizedItemId);
                    return true;
                });

                // Filtro "Hide Watched"
                merged = await filterWatchedItems(merged, userConfig);
                combinedResults.push(...merged);

                if (combinedResults.length >= 20 || merged.length === 0 || !userConfig?.config?.hideWatched) break;
            }
            results = combinedResults.slice(0, 40);
            return await finalizeCatalog(results, id, type, hostUrl, userConfig);
        }

        // ==========================================
        // SCENARIO 3: CATALOGHI TRAKT
        // ==========================================
        const traktUname = userConfig.apiKeys?.trakt;
        // Contesto per auto-refresh token Trakt (usato solo per endpoint autenticati)
        const refreshContext = (userConfig.apiKeys?.traktRefreshToken && hostUrl)
            ? { userConfig, hostUrl } : null;

        if (baseId.startsWith('trakt_')) {
            const traktTypeMap = {
                'trakt_watchlist_movies': 'watchlist_movies',
                'trakt_watchlist_series': 'watchlist_shows',
                'trakt_recommendations_movies': 'recommendations_movies',
                'trakt_recommendations_series': 'recommendations_shows',
                'trakt_history_movies': 'history_movies',
                'trakt_history_series': 'history_shows',
                'trakt_ratings_movies': 'ratings_movies',
                'trakt_ratings_series': 'ratings_shows',
                'trakt_popular_shows': 'popular_shows',
                'trakt_favorites_movies': 'favorites_movies',
                'trakt_favorites_series': 'favorites_shows'
            };

            const traktEp = traktTypeMap[baseId];
            if (traktEp) {
                const needsAuth = baseId.includes('watchlist') || baseId.includes('recommendations') || baseId.includes('history') || baseId.includes('ratings') || baseId.includes('favorites');
                const finalTraktUname = needsAuth ? traktUname : null;

                let combinedResults = [];
                const MAX_DEPTH = Math.max(PAGES_PER_REQUEST, 3);
                const pageSkips = (userConfig?.config?.hideWatched)
                    ? Array.from({ length: MAX_DEPTH }, (_, i) => skip + (i * 20))
                    : [skip];

                const fetchedPages = await Promise.all(
                    pageSkips.map(pageSkip => fetchTraktCatalog(traktEp, pageSkip, finalTraktUname, tmdbApiKey, refreshContext))
                );

                for (let pageResults of fetchedPages) {
                    pageResults = await filterWatchedItems(pageResults, userConfig);
                    combinedResults.push(...pageResults);

                    // Se abbiamo abbastanza risultati per riempire la pagina Stremio, ci fermiamo
                    if (combinedResults.length >= 20 || pageResults.length === 0 || !userConfig?.config?.hideWatched) break;
                }

                results = combinedResults.slice(0, 20); // Restituiamo esattamente una pagina
                return await finalizeCatalog(results, id, type, hostUrl, userConfig);
            }
        }


        // ==========================================
        // SCENARIO 4: CATALOGHI MDBLIST
        // ==========================================
        if (id && (id.startsWith('mdblist_') || id.startsWith('yaca_preset_mdblist_'))) {
            const listId = id.replace('yaca_preset_mdblist_', '').replace('mdblist_', '');
            const mdblistKey = userConfig.apiKeys?.mdblist || null;

            let combinedResults = [];
            const MAX_DEPTH = Math.max(PAGES_PER_REQUEST, 3);
            const pageSkips = (userConfig?.config?.hideWatched)
                ? Array.from({ length: MAX_DEPTH }, (_, i) => skip + (i * 20))
                : [skip];

            const parsedPages = await Promise.all(pageSkips.map(async (pageSkip) => {
                const page = Math.floor(pageSkip / 20) + 1;
                const items = await fetchMDBListItems(listId, mdblistKey, 'it', page);
                return parseMDBListItems(items, type, tmdbApiKey, 'it-IT');
            }));

            for (let pageResults of parsedPages) {
                // Filtro "Hide Watched"
                pageResults = await filterWatchedItems(pageResults, userConfig);
                combinedResults.push(...pageResults);

                if (combinedResults.length >= 20 || pageResults.length === 0 || !userConfig?.config?.hideWatched) break;
            }

            results = combinedResults.slice(0, 20);
            return await finalizeCatalog(results, id, type, hostUrl, userConfig);
        }

        if (catalogMeta || directFilters) {
            // ==========================================
            // UNIVERSAL PIPELINE: Normalizza e processa tramite Universal Catalog Schema
            // ==========================================
            const universalCatalog = normalizeToUniversalSchema(catalogMeta, directFilters);

            // Gestione legacy: cataloghi fusi (merged) con riferimenti ad altri cataloghi
            if (universalCatalog._isMerge) {
                const filters = universalCatalog._rawFilters;
                const mergeConfig = filters.merge || { catalogs: catalogMeta?.mergedFrom || [] };
                const sourceIds = (mergeConfig.catalogs || []).filter(sid => sid && sid !== id); // Recursion guard
                const sourceFilters = mergeConfig.sourceFilters || [];
                const sourceTypes = mergeConfig.sourceTypes || [];
                const strategy = mergeConfig.strategy || 'popularity';

                if (sourceIds.length > 0) {
                    const fetchSource = async (idx) => {
                        const srcId = sourceIds[idx];
                        if (sourceFilters[idx] && typeof sourceFilters[idx] === 'object' && !sourceFilters[idx].merge) {
                            const srcType = sourceTypes[idx] || type;
                            const srcFilters = { ...sourceFilters[idx] };
                            if (!srcFilters.strategy) srcFilters.strategy = 'discovery';
                            const items = await executeComplexStrategy(srcFilters, tmdbClient, tmdbApiKey, srcType, skip, activeProfileSettings, tmdbFetchOptions);
                            return { metas: items.slice(0, MERGED_CATALOG_PAGE_SIZE) };
                        }
                        return catalogHandler({ type, id: srcId, extra: { ...extra, skip, limit: MERGED_CATALOG_PAGE_SIZE } }, userConfig, hostUrl);
                    };

                    const sourceResults = await Promise.all(sourceIds.map((_, idx) => fetchSource(idx)));
                    const lists = sourceResults.map(res => Array.isArray(res?.metas) ? res.metas : []);

                    if (strategy === 'mixed' || strategy === 'interleave') {
                        results = interleaveMultipleResults(lists, MERGED_CATALOG_PAGE_SIZE, 0);
                    } else {
                        // Popularity: merge all, dedupe, sort by popularity
                        const combined = lists.flat();
                        const unique = Array.from(new Map(combined.map(item => [normalizeContentId(item.id), item])).values());
                        const pageResults = unique
                            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
                            .slice(0, MERGED_CATALOG_PAGE_SIZE);
                        results = await rerankMergedPage(pageResults, profileDoc, globalProfileDoc, tmdbApiKey, type, activeDnaFilters);
                    }

                    return await finalizeCatalog(results, id, type, hostUrl, userConfig);
                }
            }

            // Apply sortBy override se presente
            if (sortBy && universalCatalog.queries) {
                for (const q of universalCatalog.queries) {
                    q.sort_by = sortBy;
                }
            }

            // ==========================================
            // UNIVERSAL EXECUTION PIPELINE (Fase 2)
            // ==========================================
            results = await executeUniversalPipeline(universalCatalog, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings, tmdbFetchOptions);

            // ==========================================
            // FASE 10: HIDE WATCHED (WITH PROGRESSIVE FILL)
            // ==========================================
            if (userConfig?.config?.hideWatched) {
                let filtered = await filterWatchedItems(results, userConfig);
                let currentPool = [...filtered];

                // Se abbiamo meno di 20 elementi, proviamo a pescare le pagine successive finché non ne abbiamo abbastanza
                // o finché non raggiungiamo un limite di sicurezza (MAX_FETCH_PAGES)
                if (currentPool.length < 20 && results.length > 0) {
                    const MAX_FETCH_PAGES = 4;
                    for (let i = 1; i <= MAX_FETCH_PAGES; i++) {
                        const nextSkip = skip + (i * 20);
                        const nextPageResults = await executeUniversalPipeline(universalCatalog, tmdbClient, tmdbApiKey, type, nextSkip, activeProfileSettings, tmdbFetchOptions);
                        if (!nextPageResults || nextPageResults.length === 0) break;

                        const filteredNext = await filterWatchedItems(nextPageResults, userConfig);
                        currentPool.push(...filteredNext);

                        if (currentPool.length >= 20) break;
                    }
                }
                results = currentPool.slice(0, 20);
            }

            // Documentary fallback: se nessun risultato con keyword documentari, riprova senza keyword
            const firstQuery = universalCatalog.queries?.[0] || {};
            const withGenres = Array.isArray(firstQuery.with_genres)
                ? firstQuery.with_genres.map(String)
                : String(firstQuery.with_genres ?? '').split(/[|,]/);

            if ((!results || results.length === 0) && withGenres.includes('99') && firstQuery.with_keywords) {
                const relaxedQuery = { ...firstQuery };
                delete relaxedQuery.with_keywords;
                const relaxedCatalog = { ...universalCatalog, queries: [relaxedQuery] };
                results = await executeUniversalPipeline(relaxedCatalog, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings, tmdbFetchOptions);
            }

            // ==========================================
            // PERSONALIZZAZIONE FINALE (RANKING)
            // ==========================================
            if (profileDoc && results.length > 0) {
                await hydrateResultsFromLocalDetailsCache(results, tmdbApiKey, type);
                // Cerca pesi specifici del preset se presenti
                let presetWeights = universalCatalog.weights || { tmdb: 1.0, trakt: 1.0 };
                if (!universalCatalog.weights && id.startsWith('yaca_preset_')) {
                    const presetId = id.replace('yaca_preset_', '');
                    const presetDef = presetsList.find(p => p.id === presetId);
                    if (presetDef && presetDef.weights) {
                        presetWeights = presetDef.weights;
                    }
                }

                for (const item of results) {
                    const affinity = ProfileScorer.calculateItemMatch(item.rawTMDB || item, profileDoc, {
                        globalProfile: globalProfileDoc,
                        dnaFilters: activeDnaFilters
                    });
                    item.affinity = affinity;

                    // Formula: (Voto TMDB * Peso TMDB) + (Affinity * Peso Trakt)
                    const tmdbScore = parseFloat(item.imdbRating || 0);
                    item.finalScore = (tmdbScore * presetWeights.tmdb) + (affinity * 10 * presetWeights.trakt);
                }

                // Ordina per score finale (solo se non è una lista ordinata esplicitamente dall'utente come "newest")
                if (!sortBy || sortBy === 'popularity.desc') {
                    results.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
                }
            }

            // Fase 9: Enrichment Progressivo in background (non blocca la risposta)
            return await finalizeCatalog(results, id, type, hostUrl, userConfig);
        }

        return { metas: [] };

    } catch (err) {
        console.error("Errore Catalog Handler:", err.stack);
        return { metas: [] };
    }
}

module.exports = { catalogHandler, buildDiscoveryParams, executeUniversalPipeline };
