const { getHybridCatalog } = require('../../engines/hybridRecommendations');

const TASTE_BASED_IDS = new Set([
    // Hero Catalogs (Phase 4)
    'yaca_true_blend_movies', 'yaca_true_blend_series',
    'yaca_seed_network_movies', 'yaca_seed_network_series',
    'yaca_hidden_gems_movies', 'yaca_hidden_gems_series',
    'yaca_trakt_filtered_movies', 'yaca_trakt_filtered_series'
]);

async function getEngineHybridCatalog(baseId, type, skip, userConfig, tmdbApiKey) {
    const traktToken = userConfig.apiKeys?.trakt;
    const pageResults = await getHybridCatalog(baseId, skip, traktToken, tmdbApiKey, userConfig.userId, userConfig.activeProfileId, userConfig);
    return (pageResults || []).slice(0, 20);
}

module.exports = {
    TASTE_BASED_IDS,
    getEngineHybridCatalog
};
