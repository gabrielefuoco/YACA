const { getHybridCatalog } = require('../../engines/hybridRecommendations');

const { HERO_CATALOG_IDS_SET } = require('../registry');

const TASTE_BASED_IDS = HERO_CATALOG_IDS_SET;

async function getEngineHybridCatalog(baseId, type, skip, userConfig, tmdbApiKey, activeProfileSettings) {
    const traktToken = userConfig.apiKeys?.trakt;
    const effectiveConfig = {
        ...userConfig,
        activeProfileSettings: activeProfileSettings || userConfig?.activeProfileSettings
    };
    const pageResults = await getHybridCatalog(baseId, skip, traktToken, tmdbApiKey, userConfig.userId, userConfig.activeProfileId, effectiveConfig);
    return (pageResults || []).slice(0, 20);
}

module.exports = {
    TASTE_BASED_IDS,
    getEngineHybridCatalog
};
