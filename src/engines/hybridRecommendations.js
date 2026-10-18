const { ITEMS_PER_PAGE } = require('../config');
const TasteProfile = require('../models/TasteProfile');
const cache = require('../cache');
const { hybridRecommendationsCache } = require('../cache/cacheInstances');
const { getPresets } = require('../catalog/presets');
const { isHeroCatalogId } = require('../catalog/registry');
const { normalizeContentId } = require('../catalog/contentId');
const { isItemInappropriateForKids, applyKidsMode } = require('../catalog/kidsModeFilters');

// Modulo profilo: staleness e vettori (Ticket 41 - Fetta 1)
const { isProfileSyncDue } = require('../profile/profileStaleness');
const { computeTopGenres, computeTopKeywords } = require('../profile/vectorElements');

// Modulo pool: compositore delle righe hero
const {
    getHeroPool,
    buildSharedHeroCatalogs,
    getSharedHeroCatalogs,
    buildSharedHeroCacheKey
} = require('../pool');

// Modulo libreria: sincronizzazione fatti e registrazione impressioni (Ticket 41 - Fetta 1)
const {
    isStremioSyncDueForUser,
    syncIncrementalRecommendations
} = require('../library/syncRecommendations');
const { fetchRecentHistory } = require('../library/traktFetchers');
const { registraImpressioni } = require('../library/impressions');

// Modulo indice: idratazione card, filtraggio e paginazione (Ticket 41 - Fetta 1)
const {
    resolveCardDetails,
    cardSurvivesFilters,
    idrataEImpaginaCandidati
} = require('../indice/idratazione');

// Modulo scoring & fallback (retrocompatibilità)
const { calculateHybridScore } = require('./hybrid/scoringEngine');
const { fetchPopularFallbackIds } = require('./hybrid/dataFetchers');

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

function matchesTypeSelectors(item, typeSelectors, tipo) {
    if (!typeSelectors) return true;
    const { isItemAnime } = require('../anime');
    const animeSelector = typeSelectors.anime;
    if (animeSelector === 'only') {
        return isItemAnime(item, tipo);
    }
    if (animeSelector === 'exclude') {
        return !isItemAnime(item, tipo);
    }
    return true;
}

async function buildDirectPresetCatalog(presetId, userId, context, tmdbApiKey, mediaType, isKidsMode = false, directTypeSelectors = null) {
    const presetsList = getPresets();
    const preset = presetsList.find(p => p.id === presetId);
    if (!preset || !preset.queries || preset.queries.length === 0) {
        return [];
    }

    const { getDuckDbCatalogFromFilters } = require('../catalog/providers/DuckDbProvider');
    const tmdbType = (preset.type === 'series' || mediaType === 'series') ? 'series' : 'movie';
    const existingIds = new Set();
    const pool = [];

    for (const query of preset.queries) {
        const params = { ...query };
        delete params.strategy;

        if (!params.sort_by) params.sort_by = 'popularity.desc';
        const finalParams = isKidsMode ? applyKidsMode(params) : params;

        for (let page = 1; page <= 3; page++) {
            const skip = (page - 1) * 40;
            const results = await getDuckDbCatalogFromFilters(
                finalParams,
                tmdbType,
                skip,
                40,
                {}
            ).catch(() => []);
            const presetTipo = tmdbType === 'movie' ? 'movie' : 'tv';
            for (const item of results) {
                if (isKidsMode && isItemInappropriateForKids(item)) continue;
                if (!matchesTypeSelectors(item, directTypeSelectors, presetTipo)) continue;
                const nId = normalizeContentId(item.id);
                if (nId && !existingIds.has(nId)) {
                    existingIds.add(nId);
                    pool.push(nId);
                }
            }
        }
    }

    return pool.slice(0, 100).map(id => ({ id: String(id), matchScore: null }));
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

    const { contestoDi } = require('../profile/context');
    const ctx = userConfig?.context || await contestoDi({
        userId,
        profileId: activeProfileId,
        user: userConfig
    });
    const context = ctx.profileId;
    const isKidsMode = ctx.kidsMode;
    const effectiveTypeSelectors = ctx.selettoriEffettivi;
    const effectiveSliders = ctx.sliders || ctx.slider || userConfig?.activeProfileSettings?.sliders || userConfig?.activeProfileSettings?.slider;
    let profile = null;
    try {
        profile = await TasteProfile.findOne({ owner: userId, context });
    } catch (_e) {}
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
                selettori: effectiveTypeSelectors,
                ...(effectiveSliders ? { slider: effectiveSliders } : {})
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
            typeSelectors: effectiveTypeSelectors,
            sliders: effectiveSliders,
            slider: effectiveSliders
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

    const pageResults = await idrataEImpaginaCandidati({
        recommendationIds,
        skip,
        limit: ITEMS_PER_PAGE,
        tmdbApiKey,
        mediaType,
        isKidsMode,
        effectiveTypeSelectors
    });

    if (skip === 0 && pageResults.length > 0) {
        registraImpressioni(userId, context, catalogId, pageResults);
    }

    return pageResults;
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
    calculateHybridScore,
    computeTopGenres,
    computeTopKeywords,
    fetchPopularFallbackIds,
    buildDirectPresetCatalog,
    resolveCardDetails,
    cardSurvivesFilters,
    recommendationsCache: hybridRecommendationsCache
};
