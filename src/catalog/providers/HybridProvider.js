// src/catalog/providers/HybridProvider.js

const { getHybridCatalog } = require('../../engines/hybridRecommendations');
const { HERO_CATALOG_IDS_SET } = require('../registry');

const TASTE_BASED_IDS = HERO_CATALOG_IDS_SET;

/**
 * Provider dei cataloghi basati sul profilo (Taste-based / Hero).
 * Delega direttamente alla porta del motore tramite hybridRecommendations.
 */
async function getEngineHybridCatalog(baseId, type, skip, userConfig, tmdbApiKey, activeProfileSettings) {
    const traktToken = userConfig.apiKeys?.trakt;
    const effectiveConfig = {
        ...userConfig,
        activeProfileSettings: activeProfileSettings || userConfig?.activeProfileSettings
    };
    let targetCatalogId = baseId;
    if (!baseId.endsWith('_movies') && !baseId.endsWith('_series')) {
        const suffix = (type === 'series' || type === 'tv') ? '_series' : '_movies';
        const candidate = `${baseId}${suffix}`;
        if (HERO_CATALOG_IDS_SET.has(candidate)) {
            targetCatalogId = candidate;
        }
    }
    const pageResults = await getHybridCatalog(targetCatalogId, skip, traktToken, tmdbApiKey, userConfig.userId, userConfig.activeProfileId, effectiveConfig);
    return pageResults || [];
}

module.exports = {
    TASTE_BASED_IDS,
    getEngineHybridCatalog
};
