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

    // Cache Hybrid Recommendations (4 ore)
    RECOMMENDATIONS_CACHE_TTL_MS: 4 * 60 * 60 * 1000,

    // Deep Enrichment Settings (Fase 9)
    ENRICHMENT_BUDGET: 5,        // Max items to enrich per request
    ENRICHMENT_CHUNK_SIZE: 1,    // Items per background batch
    ENRICHMENT_DELAY_MS: 400,    // Delay between background calls

    // Refined TTLs for Deep Cache
    MOVIE_DETAILS_TTL_MS: 7 * 24 * 60 * 60 * 1000,      // 7 days
    SERIES_FINISHED_TTL_MS: 7 * 24 * 60 * 60 * 1000,  // 7 days
    SERIES_ONGOING_TTL_MS: 30 * 60 * 1000,             // 30 minutes

    // Phase 3 Level 2: Scoring & Presentation Cache TTLs
    SCORING_DATA_TTL_MS: 14 * 24 * 60 * 60 * 1000,        // 14 days (genres, keywords, cast)
    MOVIE_PRESENTATION_TTL_MS: 14 * 24 * 60 * 60 * 1000,  // 14 days base TTL for movies
    MOVIE_PRESENTATION_SWR_MS: 7 * 24 * 60 * 60 * 1000,   // 7 days SWR window for movies
    SERIES_FINISHED_PRESENTATION_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 days for ended/cancelled series
    SERIES_FINISHED_PRESENTATION_SWR_MS: 24 * 60 * 60 * 1000,     // 1 day SWR for ended series
    SERIES_ONGOING_PRESENTATION_TTL_MS: 12 * 60 * 60 * 1000,      // 12 hours for ongoing series
    SERIES_ONGOING_PRESENTATION_SWR_MS: 30 * 60 * 1000,            // 30 min SWR for ongoing series

    // Bayesian Weighted Rating parameters (IMDb formula)
    BAYESIAN_MIN_VOTES: 300,   // m: minimum votes required to be listed
    BAYESIAN_MEAN_VOTE: 6.5,   // C: mean vote across all items

    // Binge-watching detection threshold (max gap in ms between episodes in the same session)
    BINGE_SESSION_GAP_MS: 24 * 60 * 60 * 1000, // 24 hours
    BINGE_MULTIPLIER: 1.5,  // multiplier applied when binge is detected

    FORCED_FAST_CATALOG_IDS: ['yaca_anime_trending'],
    FORCED_FAST_PRESET_IDS: ['preset_new_movies', 'preset_new_series', 'preset_new_series_eps', 'preset_new_anime', 'preset_new_anime_eps', 'preset_pop_anime'],
    FORCED_SLOW_PRESET_IDS: ['preset_top_rated_movies', 'preset_top_rated_series', 'preset_80s_movies', 'preset_90s_movies', 'preset_00s_movies', 'preset_oscar_winners', 'preset_blockbusters']
};
