// src/config.js
module.exports = {
    // API Endpoints
    TMDB_ENDPOINT: 'https://api.themoviedb.org/3',

    // Paginators & Timeouts
    PAGES_PER_REQUEST: 3, // How many TMDB pages to fetch concurrently per Stremio request
    ITEMS_PER_PAGE: 20,   // Default items per page for TMDB

    // Default Fallbacks
    DEFAULT_REGION: 'IT',
    DEFAULT_LANGUAGE: 'it-IT',

    // ─── Catalog Page Cache (L1 RAM + L2 MongoDB) ───
    // Fast catalogs (New Releases, Anime Trending)
    FAST_CATALOG_PAGE1_L2_TTL_MS: 7 * 24 * 60 * 60 * 1000,  // 7 days
    FAST_CATALOG_PAGE1_SWR_MS: 15 * 60 * 1000,              // 15 min SWR
    FAST_CATALOG_DEEP_L2_TTL_MS: 7 * 24 * 60 * 60 * 1000,   // 7 days
    FAST_CATALOG_DEEP_SWR_MS: 15 * 60 * 1000,               // 15 min SWR
    // Slow catalogs (Top Rated, Oscar, Decades)
    SLOW_CATALOG_L2_TTL_MS: 14 * 24 * 60 * 60 * 1000,       // 14 days
    SLOW_CATALOG_SWR_MS: 12 * 60 * 60 * 1000,               // 12 hours SWR

    // Legacy aliases (kept for backward compat)
    CACHE_TTL_MS: 14 * 24 * 60 * 60 * 1000, // 14 giorni (default)

    // ─── Metadata Cache (single items) ───
    // Movies (completed)
    MOVIE_META_CACHE_TTL_MS: 14 * 24 * 60 * 60 * 1000,     // 14 days L2
    MOVIE_META_SWR_MS: 7 * 24 * 60 * 60 * 1000,             // 7 days SWR
    // Series (ongoing / anime)
    SERIES_META_CACHE_TTL_MS: 6 * 60 * 60 * 1000,           // 6 hours L2
    SERIES_META_SWR_MS: 30 * 60 * 1000,                     // 30 min SWR
    // Series (finished)
    SERIES_FINISHED_META_TTL_MS: 24 * 60 * 60 * 1000,       // 24 hours L2
    SERIES_FINISHED_META_SWR_MS: 24 * 60 * 60 * 1000,       // 24 hours SWR

    // Cache Hybrid Recommendations
    RECOMMENDATIONS_CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000,  // 7 giorni
    RECOMMENDATIONS_SWR_MS: 60 * 60 * 1000,                 // 1 ora SWR

    // Rating Configuration
    // Bayesian Weighted Rating parameters (IMDb formula)
    BAYESIAN_MIN_VOTES: 300,   // m: minimum votes required to be listed
    BAYESIAN_MEAN_VOTE: 6.5    // C: mean vote across all items
};
