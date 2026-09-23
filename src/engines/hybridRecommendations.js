const { ITEMS_PER_PAGE } = require('../config');
const TasteProfile = require('../models/TasteProfile');
const ProfileBuilder = require('../profile/ProfileBuilder');
const tmdb = require('../clients/tmdb');
const { prioritizeLocalizedImages } = require('../clients/tmdb');
const { hybridRecommendationsCache } = require('../cache/cacheInstances');
const { normalizeContentId } = require('../utils/contentId');
const { rateLimitedMap } = require('../utils/rateLimiter');
const { getPresets } = require('../data/presets');
const { getDuckDbMetaDetails } = require('../catalog/providers/DuckDbProvider');
const RecommendationImpression = require('../models/RecommendationImpression');
const mongoose = require('mongoose');

const { applyKidsMode, isItemInappropriateForKids } = require('../utils/kidsModeFilters');

// Import from the new hybrid layer
const { fetchRecentHistory, fetchRecentRatings, fetchTraktRecommendationsRaw, fetchTmdbSimilarCounts, fetchPopularFallbackIds, fetchHiddenGemsFallbackIds } = require('./hybrid/dataFetchers');
const { calculateHybridScore, computeTopGenres, computeTopKeywords } = require('./hybrid/scoringEngine');
const { buildDirectPresetCatalog, buildTopGenresMixCatalog, buildHybridCatalog, buildHiddenGemsCatalog, buildTraktFilteredCatalog } = require('./hybrid/catalogStrategies');

/**
 * Main endpoint: handles request for a profiled hybrid catalog.
 */
async function getHybridCatalog(catalogId, skip, traktToken, tmdbApiKey, userId, activeProfileId = 'global', userConfig = null) {
    const presetsList = getPresets();
    const matchedPreset = presetsList.find(p => p.id === catalogId);
    let mediaType = (catalogId.includes('series') || catalogId.includes('tv')) ? 'series' : 'movie';
    if (matchedPreset && matchedPreset.type) {
        mediaType = matchedPreset.type === 'series' ? 'series' : 'movie';
    }
    const context = activeProfileId || 'global';
    const profile = await TasteProfile.findOne({ owner: userId, context });
    const isKidsMode = profile?.settings?.kidsMode;
    const cacheKey = `${userId}_${context}_${catalogId}${isKidsMode ? '_kids' : ''}`;

    console.log(`[Hybrid Debug] getHybridCatalog called with catalogId=${catalogId}, userId=${userId}, context=${context}`);
    console.log(`[Hybrid Debug] profile loaded: ${!!profile}, isKidsMode=${isKidsMode}, cacheKey=${cacheKey}`);

    if (profile) {
        const now = new Date();
        const lastUpdatedMs = profile.lastUpdated ? new Date(profile.lastUpdated).getTime() : 0;
        const isStale = (now.getTime() - lastUpdatedMs) > (1000 * 60 * 60 * 12);
        if (isStale) {
            // console.log(`[Hybrid] Sincronizzazione profilo per ${userId} (${context})...`);
            syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context, userConfig).then(async (synced) => {
                if (synced) {
                    await hybridRecommendationsCache.delete(cacheKey);
                }
            }).catch(err => console.error("Errore check stale profile:", err.message));
        }
    }

    const buildRecommendIds = async () => {
        if (matchedPreset) {
            const ids = await buildDirectPresetCatalog(catalogId, userId, context, tmdbApiKey, mediaType);
            if (ids.length > 0) {
                await hybridRecommendationsCache.set(cacheKey, { ids });
                return ids;
            }
        }

        const TRUE_BLEND_IDS = new Set(['yaca_true_blend_movies', 'yaca_true_blend_series']);
        const SEED_NETWORK_IDS = new Set(['yaca_seed_network_movies', 'yaca_seed_network_series']);
        const HIDDEN_GEMS_IDS = new Set(['yaca_hidden_gems_movies', 'yaca_hidden_gems_series']);
        const TRAKT_FILTERED_IDS = new Set(['yaca_trakt_filtered_movies', 'yaca_trakt_filtered_series']);

        const ids = TRUE_BLEND_IDS.has(catalogId)
            ? await buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType)
            : SEED_NETWORK_IDS.has(catalogId)
                ? await buildHybridCatalog(userId, context, traktToken, tmdbApiKey, mediaType)
                : HIDDEN_GEMS_IDS.has(catalogId)
                    ? await buildHiddenGemsCatalog(userId, context, tmdbApiKey, mediaType)
                    : TRAKT_FILTERED_IDS.has(catalogId)
                        ? await buildTraktFilteredCatalog(userId, context, traktToken, tmdbApiKey, mediaType)
                        : [];

        await hybridRecommendationsCache.set(cacheKey, { ids });
        return ids;
    };

    let recommendationIds;
    const { value: cachedEntry, status: cacheStatus } = await hybridRecommendationsCache.getWithStatus(cacheKey);
    console.log(`[Hybrid Debug] cache status for ${cacheKey}: ${cacheStatus}`);
    if (cacheStatus !== 'miss' && Array.isArray(cachedEntry?.ids)) {
        recommendationIds = cachedEntry.ids;
        console.log(`[Hybrid Debug] returning ${recommendationIds.length} IDs from cache`);
        if (cacheStatus === 'stale') {
            console.log(`[Hybrid-SWR] Revalidando catalogo ${catalogId} in background...`);
            buildRecommendIds().catch(e => console.error('[Hybrid-SWR] Error:', e.message));
        }
    }

    if (!recommendationIds) {
        console.log(`[Hybrid Debug] building new recommend IDs for ${catalogId}`);
        recommendationIds = await buildRecommendIds();
        console.log(`[Hybrid Debug] buildRecommendIds returned ${recommendationIds?.length || 0} IDs`);
    }

    if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
        const NICHE_CATALOG_IDS = new Set([
            'yaca_hidden_gems_movies', 'yaca_hidden_gems_series',
            'yaca_trakt_filtered_movies', 'yaca_trakt_filtered_series'
        ]);

        if (NICHE_CATALOG_IDS.has(catalogId)) {
            if (catalogId.startsWith('yaca_hidden_gems')) {
                recommendationIds = await fetchHiddenGemsFallbackIds(tmdbApiKey, mediaType, 60, isKidsMode);
            } else if (catalogId.startsWith('yaca_trakt_filtered')) {
                recommendationIds = await fetchPopularFallbackIds(tmdbApiKey, mediaType, 60, isKidsMode);
            }
        } else {
            recommendationIds = await fetchPopularFallbackIds(tmdbApiKey, mediaType, 60, isKidsMode);
        }

        if (recommendationIds && recommendationIds.length > 0) {
            await hybridRecommendationsCache.set(cacheKey, { ids: recommendationIds });
        }
    }

    const pageIds = recommendationIds.slice(skip, skip + ITEMS_PER_PAGE);
    if (pageIds.length === 0) return [];

    let tmdbClient;
    const results = await rateLimitedMap(
        pageIds,
        async (recItem) => {
            try {
                // Support both legacy string IDs (if cached) and new object format { id, matchScore }
                const isObj = typeof recItem === 'object' && recItem !== null;
                const tmdbId = isObj ? recItem.id : recItem;
                const matchScore = isObj ? recItem.matchScore : null;

                const normalizedId = normalizeContentId(tmdbId);
                const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
                let item = null;
                try {
                    const duckMeta = await getDuckDbMetaDetails(normalizedId, tmdbType);
                    if (duckMeta && duckMeta.rawTMDB) {
                        item = duckMeta.rawTMDB;
                    }
                } catch (_e) {}

                if (!item) {
                    item = await tmdb.getTmdbMovieDetails(tmdbApiKey, normalizedId, tmdbType, { cacheOnly: true });
                }

                if (!item) {
                    if (!tmdbClient) tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
                    const endpoint = mediaType === 'movie' ? `/movie/${normalizedId}` : `/tv/${normalizedId}`;
                    const res = await tmdbClient.get(endpoint, {
                        params: {
                            append_to_response: 'images',
                            include_image_language: 'it,en,null'
                        }
                    });
                    item = res.data;
                }

                if (!item) return null;
                if (isKidsMode && isItemInappropriateForKids(item)) return null;

                let logoUrl = null;
                if (item.images && item.images.logos && item.images.logos.length > 0) {
                    const bestLogoArray = prioritizeLocalizedImages(item.images.logos);
                    const bestLogoObj = bestLogoArray.length > 0 ? bestLogoArray[0] : null;
                    if (bestLogoObj && bestLogoObj.file_path) {
                        logoUrl = `https://image.tmdb.org/t/p/w500${bestLogoObj.file_path}`;
                    }
                }

                let releaseYear = '';
                try {
                    const rawDate = item.release_date || item.first_air_date;
                    if (rawDate instanceof Date) {
                        releaseYear = !isNaN(rawDate.getTime()) ? rawDate.toISOString().substring(0, 4) : '';
                    } else if (typeof rawDate === 'string') {
                        releaseYear = rawDate.substring(0, 4);
                    } else if (rawDate != null) {
                        releaseYear = String(rawDate).substring(0, 4);
                    }
                } catch (_e) {
                    releaseYear = '';
                }

                let imdbRating;
                if (item.vote_average != null) {
                    const num = Number(item.vote_average);
                    if (!isNaN(num)) imdbRating = num.toFixed(1);
                }

                const genre_ids = Array.isArray(item.genre_ids)
                    ? item.genre_ids
                    : (Array.isArray(item.genres) ? item.genres.map(g => g.id).filter(id => id != null) : []);

                return {
                    id: `tmdb:${normalizedId}`,
                    type: mediaType === 'movie' ? 'movie' : 'series',
                    name: item.title || item.name || 'Unknown',
                    poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
                    posterShape: 'poster',
                    background: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
                    logo: logoUrl,
                    description: item.overview || '',
                    releaseInfo: releaseYear,
                    imdbRating,
                    genre_ids,
                    _yacaMatch: matchScore
                };
            } catch (err) {
                console.error(`[Hybrid] Errore risoluzione item ${recItem?.id || recItem}:`, err?.message || err);
                return null;
            }
        },
        { batchSize: 3, delayMs: 150 }
    );

    // Warm-up subsequent pages in the background (limit to next page slice to avoid N+1 hammering)
    const nextBatchIds = recommendationIds.slice(skip + ITEMS_PER_PAGE, skip + (ITEMS_PER_PAGE * 2));
    if (nextBatchIds.length > 0) {
        global.setImmediate(() => {
            rateLimitedMap(
                nextBatchIds,
                async (recItem) => {
                    try {
                        const isObj = typeof recItem === 'object' && recItem !== null;
                        const tmdbId = isObj ? recItem.id : recItem;
                        const normalizedId = normalizeContentId(tmdbId);
                        const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
                        const duckMeta = await getDuckDbMetaDetails(normalizedId, tmdbType);
                        if (!duckMeta || !duckMeta.rawTMDB) {
                            await tmdb.getTmdbMovieDetails(tmdbApiKey, normalizedId, tmdbType);
                        }
                    } catch (_e) { }
                },
                { batchSize: 2, delayMs: 150 }
            ).catch(err => console.error("[Background-Warmup] Error:", err.message));
        });
    }

    let cleanResults = results.filter(Boolean);
    if (isKidsMode) {
        cleanResults = applyKidsMode(cleanResults);
    }
    if (skip === 0 && cleanResults.length > 0) {
        const currentDateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const RecommendationImpression = require('../models/RecommendationImpression');
        
        const ops = cleanResults.map(item => {
            const normalizedId = item.id.replace('tmdb:', '');
            return {
                updateOne: {
                    filter: {
                        owner: userId,
                        profileId: context,
                        catalogId: catalogId,
                        tmdbId: normalizedId
                    },
                    update: {
                        $addToSet: { seenDates: currentDateStr }
                    },
                    upsert: true
                }
            };
        });

        if (process.env.NODE_ENV !== 'test' && mongoose.connection?.readyState === 1) {
            global.setImmediate(() => {
                RecommendationImpression.bulkWrite(ops).catch(err => {
                    console.error("[Impression-Tracking] Error during bulkWrite:", err.message);
                });
            });
        }
    }

    return cleanResults;
}

/**
 * Incremental user profile synchronization from Trakt history.
 */
async function syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context = 'global', userConfig = null) {
    if (!userId || !traktToken || !tmdbApiKey) return false;

    try {
        const traktType = mediaType === 'movie' ? 'movies' : 'shows';
        const [history, ratings] = await Promise.all([
            fetchRecentHistory(traktToken, traktType, 40, userConfig),
            fetchRecentRatings(traktToken, traktType, 40, userConfig)
        ]);
        const combined = [...(history || []), ...(ratings || [])];

        // Se non ci sono nuove interazioni (es. Trakt vuoto o errore 403),
        // aggiorniamo comunque lastUpdated per non ripetere il check ad ogni richiesta
        // ed evitiamo di invalidare inutilmente la cache delle raccomandazioni (BUG-3)
        if (combined.length === 0) {
            if (typeof TasteProfile.updateOne === 'function') {
                await TasteProfile.updateOne({ owner: userId, context }, { $set: { lastUpdated: new Date() } });
            }
            return false;
        }

        const syncResult = await ProfileBuilder.syncUserHistory(userId, context, combined, tmdbApiKey);
        if (typeof TasteProfile.updateOne === 'function') {
            await TasteProfile.updateOne({ owner: userId, context }, { $set: { lastUpdated: new Date() } });
        }
        return syncResult !== false;
    } catch (err) {
        console.error(`[Hybrid] syncIncrementalRecommendations failed for ${userId}/${context}:`, err.message);
        return false;
    }
}

module.exports = {
    getHybridCatalog,
    syncIncrementalRecommendations,
    fetchRecentHistory,
    fetchRecentRatings,
    fetchTraktRecommendationsRaw,
    fetchTmdbSimilarCounts,
    calculateHybridScore,
    computeTopGenres,
    computeTopKeywords,
    fetchPopularFallbackIds,
    fetchHiddenGemsFallbackIds,
    buildDirectPresetCatalog,
    buildHybridCatalog,
    buildTopGenresMixCatalog,
    buildHiddenGemsCatalog,
    buildTraktFilteredCatalog,
    recommendationsCache: hybridRecommendationsCache
};
