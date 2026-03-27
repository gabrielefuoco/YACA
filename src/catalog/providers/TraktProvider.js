const { fetchTraktCatalog } = require('../../clients/trakt');
const { filterWatchedItems } = require('../processors/FilterWatched');
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

    let combinedResults = [];
    const MAX_DEPTH = Math.max(PAGES_PER_REQUEST || 3, 3);
    const pageSkips = (userConfig?.config?.hideWatched)
        ? Array.from({ length: MAX_DEPTH }, (_, i) => skip + (i * 20))
        : [skip];

    const fetchedPages = await Promise.all(
        pageSkips.map(pageSkip => fetchTraktCatalog(traktEp, pageSkip, finalTraktUname, tmdbApiKey, refreshContext).catch(() => []))
    );

    for (let pageResults of fetchedPages) {
        pageResults = await filterWatchedItems(pageResults, userConfig);
        combinedResults.push(...pageResults);

        if (combinedResults.length >= 20 || pageResults.length === 0 || !userConfig?.config?.hideWatched) break;
    }

    return combinedResults.slice(0, 20);
}

module.exports = { getTraktCatalog, TRAKT_TYPE_MAP };
