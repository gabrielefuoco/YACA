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
 * DELEGATORE verso src/pool (Ticket 41 - Fetta 2).
 */
async function getHybridCatalog(catalogId, skip, traktToken, tmdbApiKey, userId, activeProfileId = 'global', userConfig = null) {
    const { getHybridCatalog: poolGetHybridCatalog } = require('../pool');
    return poolGetHybridCatalog(catalogId, skip, traktToken, tmdbApiKey, userId, activeProfileId, userConfig);
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
