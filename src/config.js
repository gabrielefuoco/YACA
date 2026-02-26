// src/config.js
module.exports = {
    // API Endpoints
    TMDB_ENDPOINT: 'https://api.themoviedb.org/3',
    KITSU_ENDPOINT: 'https://kitsu.io/api/edge',
    TRAKT_ENDPOINT: 'https://api.trakt.tv',

    // Paginators & Timeouts
    PAGES_PER_REQUEST: 3, // How many TMDB pages to fetch concurrently per Stremio request
    ITEMS_PER_PAGE: 20,   // Default items per page for TMDB
    MAX_RESULTS: 100,     // Hard limit on results per Stremio response
    TMDB_TIMEOUT: 15000,
    AI_TIMEOUT: 25000,

    // Default Fallbacks
    DEFAULT_REGION: 'IT',
    DEFAULT_LANGUAGE: 'it-IT',

    // Cache TMDB Request (Fase 3)
    CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24 ore (default)
    FAST_CACHE_TTL_MS: 30 * 60 * 1000, // 30 minuti
    SLOW_CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 giorni

    // Cache Meta
    SERIES_META_CACHE_TTL_MS: 30 * 60 * 1000, // 30 minuti
    MOVIE_META_CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24 ore

    FORCED_FAST_CATALOG_IDS: ['yaca_anime_trending'],
    FORCED_FAST_PRESET_IDS: ['preset_new_movies', 'preset_new_series', 'preset_new_series_eps', 'preset_new_anime', 'preset_new_anime_eps', 'preset_pop_anime'],
    FORCED_SLOW_PRESET_IDS: ['preset_top_rated_movies', 'preset_top_rated_series', 'preset_80s_movies', 'preset_90s_movies', 'preset_00s_movies', 'preset_oscar_winners', 'preset_blockbusters']
};
