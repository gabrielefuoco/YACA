const { ITEMS_PER_PAGE } = require('../config');
const TasteProfile = require('../models/TasteProfile');
const ProfileBuilder = require('../profile/ProfileBuilder');
const tmdb = require('../clients/tmdb');
const { hybridRecommendationsCache } = require('../cache/cacheInstances');
const { normalizeContentId } = require('../utils/contentId');
const { rateLimitedMap } = require('../utils/rateLimiter');
const { getPresets } = require('../data/presets');

// Import from the new hybrid layer
const { fetchRecentHistory, fetchRecentRatings, fetchTraktRecommendationsRaw, fetchTmdbSimilarCounts, fetchPopularFallbackIds, fetchHiddenGemsFallbackIds } = require('./hybrid/dataFetchers');
const { calculateHybridScore, computeTopGenres, computeTopKeywords, resolveAiQueryToTmdbParams, saveScoringData, twoTierScore } = require('./hybrid/scoringEngine');
const { buildDirectPresetCatalog, buildTopGenresMixCatalog, buildHybridCatalog, buildHiddenGemsCatalog, buildTraktFilteredCatalog } = require('./hybrid/catalogStrategies');

/**
 * Main endpoint: handles request for a profiled hybrid catalog.
 */
async function getHybridCatalog(catalogId, skip, traktToken, tmdbApiKey, userId, activeProfileId = 'global') {
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

    if (profile) {
        const now = new Date();
        const isStale = (now - profile.lastUpdated) > (1000 * 60 * 60 * 12);
        if (isStale) {
            console.log(`[Hybrid] Sincronizzazione profilo per ${userId} (${context})...`);
            syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context).then(async (synced) => {
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
    if (cacheStatus !== 'miss' && Array.isArray(cachedEntry?.ids)) {
        recommendationIds = cachedEntry.ids;
        if (cacheStatus === 'stale') {
            console.log(`[Hybrid-SWR] Revalidando catalogo ${catalogId} in background...`);
            buildRecommendIds().catch(e => console.error('[Hybrid-SWR] Error:', e.message));
        }
    }

    if (!recommendationIds) {
        recommendationIds = await buildRecommendIds();
    }

    if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
        const NICHE_CATALOG_IDS = new Set([
            'yaca_hidden_gems_movies', 'yaca_hidden_gems_series',
            'yaca_trakt_filtered_movies', 'yaca_trakt_filtered_series'
        ]);

        if (NICHE_CATALOG_IDS.has(catalogId)) {
            if (catalogId.startsWith('yaca_hidden_gems')) {
                recommendationIds = await fetchHiddenGemsFallbackIds(tmdbApiKey, mediaType);
            }
        } else {
            recommendationIds = await fetchPopularFallbackIds(tmdbApiKey, mediaType);
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
        async (tmdbId) => {
            try {
                const normalizedId = normalizeContentId(tmdbId);
                const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
                let item = await tmdb.getTmdbMovieDetails(tmdbApiKey, normalizedId, tmdbType, { cacheOnly: true });

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

                let logoUrl = null;
                if (item.images && item.images.logos && item.images.logos.length > 0) {
                    const { prioritizeLocalizedImages } = require('../clients/tmdb');
                    const bestLogoArray = prioritizeLocalizedImages(item.images.logos);
                    const bestLogoObj = bestLogoArray.length > 0 ? bestLogoArray[0] : null;
                    if (bestLogoObj && bestLogoObj.file_path) {
                        logoUrl = `https://image.tmdb.org/t/p/w500${bestLogoObj.file_path}`;
                    }
                }

                return {
                    id: `tmdb:${normalizedId}`,
                    type: mediaType === 'movie' ? 'movie' : 'series',
                    name: item.title || item.name || 'Unknown',
                    poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
                    posterShape: 'poster',
                    background: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
                    logo: logoUrl,
                    description: item.overview || '',
                    releaseInfo: (item.release_date || item.first_air_date || '').substring(0, 4),
                    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : undefined,
                    genre_ids: item.genre_ids || (item.genres ? item.genres.map(g => g.id) : [])
                };
            } catch (_e) {
                return null;
            }
        },
        { batchSize: 3, delayMs: 150 }
    );

    // Warm-up subsequent pages in the background (from the next item after the current page slice onwards)
    const remainingIds = recommendationIds.slice(skip + ITEMS_PER_PAGE);
    if (remainingIds.length > 0) {
        global.setImmediate(() => {
            rateLimitedMap(
                remainingIds,
                async (tmdbId) => {
                    try {
                        const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
                        await tmdb.getTmdbMovieDetails(tmdbApiKey, tmdbId.toString(), tmdbType);
                    } catch (_e) { }
                },
                { batchSize: 1, delayMs: 300 }
            ).catch(err => console.error("[Background-Warmup] Error:", err.message));
        });
    }

    const cleanResults = results.filter(Boolean);
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

        global.setImmediate(() => {
            RecommendationImpression.bulkWrite(ops).catch(err => {
                console.error("[Impression-Tracking] Error during bulkWrite:", err.message);
            });
        });
    }

    return cleanResults;
}

/**
 * Incremental user profile synchronization from Trakt history.
 */
async function syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context = 'global') {
    if (!userId || !traktToken || !tmdbApiKey) return false;

    try {
        const traktType = mediaType === 'movie' ? 'movies' : 'shows';
        const [history, ratings] = await Promise.all([
            fetchRecentHistory(traktToken, traktType, 40),
            fetchRecentRatings(traktToken, traktType, 40)
        ]);
        await ProfileBuilder.syncUserHistory(userId, context, [...history, ...ratings], tmdbApiKey);
        return true;
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
    twoTierScore,
    resolveAiQueryToTmdbParams,
    saveScoringData,
    recommendationsCache: hybridRecommendationsCache
};
