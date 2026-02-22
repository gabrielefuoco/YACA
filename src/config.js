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
};
