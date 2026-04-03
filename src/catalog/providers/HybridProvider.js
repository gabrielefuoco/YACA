const { getHybridCatalog } = require('../../engines/hybridRecommendations');
const { fetchTmdbCatalog } = require('../../clients/tmdb');
const { fetchTraktCatalog } = require('../../clients/trakt');
const { filterWatchedItems } = require('../processors/FilterWatched');
const { normalizeContentId } = require('../../utils/contentId');
const { PAGES_PER_REQUEST } = require('../../config');

const TASTE_BASED_IDS = new Set([
    // Hero Catalogs (Phase 4)
    'yaca_true_blend_movies', 'yaca_true_blend_series',
    'yaca_seed_network_movies', 'yaca_seed_network_series',
    'yaca_hidden_gems_movies', 'yaca_hidden_gems_series',
    'yaca_trakt_filtered_movies', 'yaca_trakt_filtered_series'
]);

async function getEngineHybridCatalog(baseId, type, skip, userConfig, tmdbApiKey) {
    const traktToken = userConfig.apiKeys?.trakt;
    let combinedResults = [];

    const parallelPages = (userConfig?.config?.hideWatched) ? 3 : 1;
    const promises = [];
    for (let i = 0; i < parallelPages; i++) {
        promises.push(getHybridCatalog(baseId, skip + (i * 20), traktToken, tmdbApiKey, userConfig.userId, userConfig.activeProfileId));
    }

    const pagesResults = await Promise.all(promises);
    for (let pageResults of pagesResults) {
        pageResults = await filterWatchedItems(pageResults, userConfig);
        combinedResults.push(...pageResults);
        if (combinedResults.length >= 20) break;
    }
    return combinedResults.slice(0, 20);
}

async function getHybridPopularCatalog(baseId, type, skip, userConfig, tmdbClient, tmdbApiKey, tmdbFetchOptions) {
    const isMovie = type === 'movie';
    const tmdbEp = isMovie ? '/discover/movie' : '/discover/tv';
    const traktEp = isMovie ? 'popular_movies' : 'popular_shows';
    const contentType = isMovie ? 'movie' : 'series';

    let combinedResults = [];
    const MAX_DEPTH = Math.max(PAGES_PER_REQUEST || 3, 3);
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

        merged = await filterWatchedItems(merged, userConfig);
        combinedResults.push(...merged);

        if (combinedResults.length >= 20 || merged.length === 0 || !userConfig?.config?.hideWatched) break;
    }
    
    return combinedResults.slice(0, 40); // Preserving the original behavior which returned up to 40 items
}

module.exports = {
    TASTE_BASED_IDS,
    getEngineHybridCatalog,
    getHybridPopularCatalog
};
