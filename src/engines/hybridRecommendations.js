const { ITEMS_PER_PAGE } = require('../config');
const TasteProfile = require('../models/TasteProfile');
const ProfileBuilder = require('../profile/ProfileBuilder');
const tmdb = require('../clients/tmdb');
const { prioritizeLocalizedImages } = require('../clients/tmdb');
const cache = require('../cache');
const { hybridRecommendationsCache } = require('../cache/cacheInstances');
const { normalizeContentId } = require('../utils/contentId');
const { rateLimitedMap } = require('../utils/rateLimiter');
const { getPresets } = require('../data/presets');
const { getDuckDbMetaDetails } = require('../catalog/providers/DuckDbProvider');
const RecommendationImpression = require('../models/RecommendationImpression');
const mongoose = require('mongoose');

const { applyKidsMode, isItemInappropriateForKids } = require('../utils/kidsModeFilters');
const { resolveAnimePolicy, getEffectiveTypeSelectors, isItemAnime } = require('./hybrid/animePolicy');
const { isProfileSyncDue, isStremioSyncDue } = require('./profileStaleness');
const { isHeroCatalogId } = require('../catalog/registry');

// Modulo pool (Ticket 12): il feed consuma la porta unica e non gestisce più le strategie né l'assegnazione
const {
    getHeroPool,
    buildSharedHeroCatalogs,
    getSharedHeroCatalogs,
    buildSharedHeroCacheKey
} = require('../pool');

function getActiveTypeSelectors(userConfig, context) {
    if (userConfig?.activeProfileSettings?.typeSelectors) {
        return userConfig.activeProfileSettings.typeSelectors;
    }
    if (userConfig?.typeSelectors) {
        return userConfig.typeSelectors;
    }
    const profiles = userConfig?.profiles ?? userConfig?.config?.profiles ?? [];
    const activeProfile = profiles.find(profile => profile.id === context);
    return activeProfile?.settings?.typeSelectors || activeProfile?.typeSelectors || null;
}

// Data fetchers per sync e preset
const {
    fetchProfileContext,
    fetchRecentHistory,
    fetchRecentRatings,
    fetchTraktRecommendationsRaw,
    fetchTmdbSimilarCounts,
    fetchPopularFallbackIds
} = require('./hybrid/dataFetchers');
const { calculateHybridScore, computeTopGenres, computeTopKeywords } = require('./hybrid/scoringEngine');
const { buildDirectPresetCatalog } = require('./hybrid/catalogStrategies');

function getActiveKidsMode(userConfig, context) {
    if (typeof userConfig?.activeProfileSettings?.kidsMode === 'boolean') {
        return userConfig.activeProfileSettings.kidsMode;
    }
    if (typeof userConfig?.kidsMode === 'boolean') {
        return userConfig.kidsMode;
    }
    const profiles = userConfig?.profiles ?? userConfig?.config?.profiles ?? [];
    const activeProfile = profiles.find(profile => profile.id === context);
    return (activeProfile?.settings?.kidsMode ?? activeProfile?.kidsMode) === true;
}

function buildRecommendationCacheKey({ userId, context, catalogId, kidsMode, typeSelectors }) {
    const { chiave } = cache.deriva({
        nome: 'recommendations',
        dipendenze: {
            varia: {
                utente: userId,
                profilo: context,
                catalogo: catalogId,
                kids: kidsMode,
                selettori: typeSelectors
            }
        }
    });
    return chiave;
}

async function resolveCardDetails(recItem, tmdbApiKey, mediaType, tmdbClientHolder) {
    try {
        const isObj = typeof recItem === 'object' && recItem !== null;
        const tmdbId = isObj ? (recItem.tmdbId !== undefined ? recItem.tmdbId : recItem.id) : recItem;
        const matchScore = isObj ? recItem.matchScore : null;
        const itemFallbackUsed = isObj ? recItem.fallbackUsed : undefined;
        const itemTraktAvailable = isObj ? recItem.traktAvailable : undefined;

        const normalizedId = normalizeContentId(tmdbId);
        const itemMedium = isObj ? (recItem.media_type || (recItem.type === 'series' ? 'tv' : recItem.type)) : null;
        const tmdbType = (itemMedium === 'tv' || itemMedium === 'series') ? 'tv' : (itemMedium === 'movie' ? 'movie' : (mediaType === 'movie' ? 'movie' : 'tv'));
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
            if (!tmdbClientHolder.client) tmdbClientHolder.client = tmdb.createTmdbClient(tmdbApiKey);
            const endpoint = tmdbType === 'movie' ? `/movie/${normalizedId}` : `/tv/${normalizedId}`;
            const res = await tmdbClientHolder.client.get(endpoint, {
                params: {
                    append_to_response: 'images,keywords',
                    include_image_language: 'it,en,null'
                }
            });
            item = res.data;
        }

        if (!item) return null;

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
            } else if (rawDate !== null && rawDate !== undefined) {
                releaseYear = String(rawDate).substring(0, 4);
            }
        } catch (_e) {
            releaseYear = '';
        }

        let imdbRating;
        if (item.vote_average !== null && item.vote_average !== undefined) {
            const num = Number(item.vote_average);
            if (!isNaN(num)) imdbRating = num.toFixed(1);
        }

        const genre_ids = Array.isArray(item.genre_ids)
            ? item.genre_ids
            : (Array.isArray(item.genres) ? item.genres.map(g => g.id).filter(id => id !== null && id !== undefined) : []);
        const keywords = Array.isArray(item.keywords)
            ? item.keywords
            : (item.keywords?.results || item.keywords?.keywords || []);

        const cardType = (tmdbType === 'tv' || tmdbType === 'series') ? 'series' : 'movie';
        const cardMediaType = tmdbType === 'movie' ? 'movie' : 'tv';

        return {
            id: `tmdb:${normalizedId}`,
            type: cardType,
            media_type: cardMediaType,
            name: item.title || item.name || 'Unknown',
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
            posterShape: 'poster',
            background: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
            logo: logoUrl,
            description: item.overview || '',
            releaseInfo: releaseYear,
            imdbRating,
            genre_ids,
            original_language: item.original_language || item.originalLanguage || null,
            keywords,
            _yacaMatch: matchScore,
            ...(itemFallbackUsed !== undefined ? { fallbackUsed: itemFallbackUsed } : {}),
            ...(itemTraktAvailable !== undefined ? { traktAvailable: itemTraktAvailable } : {}),
            rawTMDB: item
        };
    } catch (err) {
        console.error(`[Hybrid] Errore risoluzione item ${recItem?.id || recItem}:`, err?.message || err);
        return null;
    }
}

function cardSurvivesFilters(card, { isKidsMode, effectiveTypeSelectors }) {
    if (!card) return false;
    if (isKidsMode && isItemInappropriateForKids(card)) return false;
    if (effectiveTypeSelectors?.anime === 'only' && !isItemAnime(card)) return false;
    if (effectiveTypeSelectors?.anime === 'exclude' && isItemAnime(card)) return false;
    return true;
}

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
    const { contestoDi } = require('../profile');
    const ctx = userConfig?.context || await contestoDi({
        userId,
        profileId: activeProfileId,
        user: userConfig
    });
    const context = ctx.profileId;
    const isKidsMode = ctx.kidsMode;
    const effectiveTypeSelectors = ctx.selettoriEffettivi;
    const profile = await TasteProfile.findOne({ owner: userId, context });
    const isHero = isHeroCatalogId(catalogId);
    console.log(`[Hybrid Debug] getHybridCatalog called with catalogId=${catalogId}, userId=${userId}, context=${context}`);
    console.log(`[Hybrid Debug] profile loaded: ${!!profile}, isKidsMode=${isKidsMode}`);

    const recDesc = {
        nome: 'recommendations',
        dipendenze: {
            varia: {
                utente: userId,
                profilo: context,
                catalogo: catalogId,
                kids: isKidsMode,
                selettori: effectiveTypeSelectors
            }
        },
        ttl: 7 * 24 * 60 * 60 * 1000 // 7 giorni
    };

    if (profile) {
        if (isProfileSyncDue(profile.lastUpdated, new Date())) {
            syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context, userConfig).then(async (synced) => {
                if (synced) {
                    await cache.cancella(recDesc);
                }
            }).catch(err => console.error("Errore check stale profile:", err.message));
        }
    }

    let recommendationIds;
    if (isHero) {
        const poolResults = await getHeroPool({
            userId,
            context,
            mediaType,
            traktToken,
            tmdbApiKey,
            kidsMode: isKidsMode,
            userConfig,
            typeSelectors: effectiveTypeSelectors
        });
        recommendationIds = poolResults[catalogId] || poolResults.catalogs?.[catalogId] || [];
        console.log(`[HeroPool] ${catalogId}: ${recommendationIds.length} assigned IDs`);
    } else {
        const buildRecommendIds = async () => {
            if (matchedPreset) {
                const ids = await buildDirectPresetCatalog(catalogId, userId, context, tmdbApiKey, mediaType, isKidsMode, effectiveTypeSelectors);
                if (ids.length > 0) {
                    await cache.scrivi(recDesc, { ids });
                    return ids;
                }
            }
            const ids = [];
            await cache.scrivi(recDesc, { ids });
            return ids;
        };

        const { value: cachedEntry, status: cacheStatus } = await cache.leggi(recDesc);
        console.log(`[Hybrid Debug] cache status for ${catalogId}: ${cacheStatus}`);
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
        }

        if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
            recommendationIds = await fetchPopularFallbackIds(tmdbApiKey, mediaType, 160, isKidsMode);
            if (recommendationIds.length > 0) {
                await cache.scrivi(recDesc, { ids: recommendationIds });
            }
        }
    }

    if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
        return [];
    }

    // Ticket 12 / Ticket 38: Il cap (ITEMS_PER_PAGE) si applica DOPO i filtri, MAI prima.
    // Iteriamo sui candidati del pool a blocchi e raccogliamo solo ciò che sopravvive
    // ai filtri post-fetch (kidsMode, animePolicy / effectiveTypeSelectors) fino a
    // soddisfare la pagina richiesta (skip + ITEMS_PER_PAGE).
    const targetCount = skip + ITEMS_PER_PAGE;
    const cleanResults = [];
    const tmdbClientHolder = { client: null };
    const BATCH_SIZE = ITEMS_PER_PAGE;
    let processedIndex = 0;

    for (let i = 0; i < recommendationIds.length && cleanResults.length < targetCount; i += BATCH_SIZE) {
        const chunk = recommendationIds.slice(i, i + BATCH_SIZE);
        processedIndex = i + chunk.length;
        const resolved = await rateLimitedMap(
            chunk,
            recItem => resolveCardDetails(recItem, tmdbApiKey, mediaType, tmdbClientHolder),
            { batchSize: 3, delayMs: 150 }
        );
        for (const card of resolved) {
            if (cardSurvivesFilters(card, { isKidsMode, effectiveTypeSelectors })) {
                cleanResults.push(card);
                if (cleanResults.length >= targetCount) break;
            }
        }
    }

    // Warm-up dei successivi elementi in background
    const nextBatchIds = recommendationIds.slice(processedIndex, processedIndex + ITEMS_PER_PAGE);
    if (nextBatchIds.length > 0) {
        global.setImmediate(() => {
            rateLimitedMap(
                nextBatchIds,
                async (recItem) => {
                    try {
                        const isObj = typeof recItem === 'object' && recItem !== null;
                        const tmdbId = isObj ? (recItem.tmdbId !== undefined ? recItem.tmdbId : recItem.id) : recItem;
                        const normalizedId = normalizeContentId(tmdbId);
                        const itemMedium = isObj ? (recItem.media_type || (recItem.type === 'series' ? 'tv' : recItem.type)) : null;
                        const tmdbType = (itemMedium === 'tv' || itemMedium === 'series') ? 'tv' : (itemMedium === 'movie' ? 'movie' : (mediaType === 'movie' ? 'movie' : 'tv'));
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

    const pageResults = cleanResults.slice(skip, skip + ITEMS_PER_PAGE);

    if (skip === 0 && pageResults.length > 0) {
        const currentDateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const ops = pageResults.map(item => {
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

    return pageResults;
}

/**
 * La parte Stremio (likes/loved) ha una cadenza PROPRIA, scritta sulla configurazione a
 * ogni sync (`config.lastStremioSync` + `config.nextSyncInterval`, 8 ore ± jitter).
 *
 * @param {object|null} userConfig configurazione risolta che porta il bookkeeping del sync
 * @returns {boolean} true se il sync Stremio è dovuto adesso
 */
function isStremioSyncDueForUser(userConfig) {
    const config = userConfig?.config || userConfig || {};
    return isStremioSyncDue(config.lastStremioSync, new Date(), config.nextSyncInterval);
}

/**
 * Incremental user profile synchronization from Trakt history.
 */
async function syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context = 'global', userConfig = null) {
    if (!userId || !traktToken || !tmdbApiKey) return false;

    try {
        const stremioKey = userConfig?.apiKeys?.stremio || userConfig?.stremioKey;
        let stremioKeyToUse = stremioKey;
        if (!stremioKeyToUse) {
            try {
                const UserAccount = require('../models/UserAccount');
                const account = await UserAccount.findOne({ userId }).lean();
                stremioKeyToUse = account?.apiKeys?.stremio;
            } catch (_e) {}
        }
        if (stremioKeyToUse && isStremioSyncDueForUser(userConfig)) {
            try {
                const { syncAllStremioData } = require('../stremio');
                await syncAllStremioData(userId, stremioKeyToUse, context);
            } catch (sErr) {
                console.warn(`[Hybrid] Stremio periodic likes sync failed:`, sErr.message);
            }
        }

        const traktType = mediaType === 'movie' ? 'movies' : 'shows';
        const [history, ratings] = await Promise.all([
            fetchRecentHistory(traktToken, traktType, 40, userConfig),
            fetchRecentRatings(traktToken, traktType, 40, userConfig)
        ]);
        const combined = [...(history || []), ...(ratings || [])];

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
    isStremioSyncDueForUser,
    getActiveKidsMode,
    buildRecommendationCacheKey,
    buildSharedHeroCacheKey,
    buildSharedHeroCatalogs,
    getSharedHeroCatalogs,
    syncIncrementalRecommendations,
    fetchRecentHistory,
    fetchTraktRecommendationsRaw,
    fetchTmdbSimilarCounts,
    calculateHybridScore,
    computeTopGenres,
    computeTopKeywords,
    fetchPopularFallbackIds,
    buildDirectPresetCatalog,
    recommendationsCache: hybridRecommendationsCache
};
