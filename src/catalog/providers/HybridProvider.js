const { getHybridCatalog } = require('../../engines/hybridRecommendations');

const { fetchTraktCatalog } = require('../../clients/trakt');
const { getBaseId } = require('../../utils/contentId');
const { getDuckDbCatalogFromFilters } = require('./DuckDbProvider');

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

async function getHybridPopularCatalog(baseId, type, skip, userConfig, tmdbClient, tmdbApiKey, tmdbFetchOptions) {
    const isMovie = type === 'movie';
    const traktEp = isMovie ? 'popular_movies' : 'popular_shows';

    const [tmdbResults, traktResults] = await Promise.all([
        getDuckDbCatalogFromFilters({ sort_by: 'popularity.desc', 'vote_count.gte': 50 }, type, skip, 20, {}),
        fetchTraktCatalog(traktEp, skip, null, tmdbApiKey).catch(() => [])
    ]);

    const seen = new Set();
    const merged = [...(tmdbResults || []), ...(traktResults || [])].filter(item => {
        const idKey = getBaseId(item.id);
        if (seen.has(idKey)) return false;
        seen.add(idKey);
        return true;
    });

    return merged.slice(0, 40); // Preserving the original behavior which returned up to 40 items
}

module.exports = {
    TASTE_BASED_IDS,
    getEngineHybridCatalog,
    getHybridPopularCatalog
};
