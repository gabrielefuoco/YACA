const { fetchTraktCatalog } = require('../../clients/trakt');
const { executePaginatedFetch } = require('./paginationHelper');
const { PAGES_PER_REQUEST } = require('../../config');

const TRAKT_TYPE_MAP = {
    'trakt_watchlist_movies': 'watchlist_movies',
    'trakt_watchlist_series': 'watchlist_shows',
    'trakt_recommendations_movies': 'recommendations_movies',
    'trakt_recommendations_series': 'recommendations_shows',
    'trakt_history_movies': 'history_movies',
    'trakt_history_series': 'history_shows',
    'trakt_ratings_movies': 'ratings_movies',
    'trakt_ratings_series': 'ratings_shows',
    'trakt_popular_shows': 'popular_shows',
    'trakt_favorites_movies': 'favorites_movies',
    'trakt_favorites_series': 'favorites_shows'
};

async function getTraktCatalog(baseId, skip, userConfig, tmdbApiKey, hostUrl) {
    const traktEp = TRAKT_TYPE_MAP[baseId];
    if (!traktEp) return [];

    const traktUname = userConfig.apiKeys?.trakt;
    const needsAuth = baseId.includes('watchlist') || baseId.includes('recommendations') || baseId.includes('history') || baseId.includes('ratings') || baseId.includes('favorites');
    const finalTraktUname = needsAuth ? traktUname : null;

    const refreshContext = (userConfig.apiKeys?.traktRefreshToken && hostUrl) ? { userConfig, hostUrl } : null;

    const MAX_DEPTH = Math.max(PAGES_PER_REQUEST || 3, 3);

    return await executePaginatedFetch(
        (pageSkip) => fetchTraktCatalog(traktEp, pageSkip, finalTraktUname, tmdbApiKey, refreshContext).catch(() => []),
        skip,
        20,
        userConfig,
        { maxParallelPages: MAX_DEPTH, batchSize: MAX_DEPTH }
    );
}


module.exports = { getTraktCatalog, TRAKT_TYPE_MAP };
