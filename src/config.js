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

    // ─── Catalog Page Cache (L1 Redis + L2 MongoDB) ───
    // Fast catalogs (New Releases, Anime Trending)
    FAST_CATALOG_PAGE1_L2_TTL_MS: 30 * 60 * 1000,          // 30 min
    FAST_CATALOG_PAGE1_SWR_MS: 15 * 60 * 1000,              // 15 min SWR
    FAST_CATALOG_DEEP_L2_TTL_MS: 60 * 60 * 1000,            // 1 hour
    FAST_CATALOG_DEEP_SWR_MS: 15 * 60 * 1000,               // 15 min SWR
    // Slow catalogs (Top Rated, Oscar, Decades)
    SLOW_CATALOG_L2_TTL_MS: 24 * 60 * 60 * 1000,            // 24 hours
    SLOW_CATALOG_SWR_MS: 12 * 60 * 60 * 1000,               // 12 hours SWR

    // Legacy aliases (kept for backward compat)
    CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24 ore (default)
    FAST_CACHE_TTL_MS: 30 * 60 * 1000, // 30 minuti
    SLOW_CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 giorni

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

    // Cache Hybrid Recommendations (4 ore)
    RECOMMENDATIONS_CACHE_TTL_MS: 4 * 60 * 60 * 1000,

    // Deep Enrichment Settings (Fase 9)
    ENRICHMENT_BUDGET: 18,       // Max items to enrich per request
    ENRICHMENT_CHUNK_SIZE: 1,    // Items per background batch
    ENRICHMENT_DELAY_MS: 600,    // Delay between background calls

    // Refined TTLs for Deep Cache
    MOVIE_DETAILS_TTL_MS: 14 * 24 * 60 * 60 * 1000,     // 14 days (completed movies)
    SERIES_FINISHED_TTL_MS: 24 * 60 * 60 * 1000,         // 1 day
    SERIES_ONGOING_TTL_MS: 30 * 60 * 1000,               // 30 minutes

    // ─── Recommendation Engine Cache ───
    SCORING_DATA_TTL_MS: 14 * 24 * 60 * 60 * 1000,        // 14 days (genres, keywords, cast)
    MOVIE_PRESENTATION_TTL_MS: 14 * 24 * 60 * 60 * 1000,  // 14 days base TTL for movies
    MOVIE_PRESENTATION_SWR_MS: 7 * 24 * 60 * 60 * 1000,   // 7 days SWR window for movies
    SERIES_FINISHED_PRESENTATION_TTL_MS: 24 * 60 * 60 * 1000,     // 1 day
    SERIES_FINISHED_PRESENTATION_SWR_MS: 24 * 60 * 60 * 1000,     // 1 day SWR for ended series
    SERIES_ONGOING_PRESENTATION_TTL_MS: 12 * 60 * 60 * 1000,      // 12 hours for ongoing series
    SERIES_ONGOING_PRESENTATION_SWR_MS: 30 * 60 * 1000,            // 30 min SWR for ongoing series

    // ─── Session Data (Redis only) ───
    BINGE_TIMER_TTL_MS: 48 * 60 * 60 * 1000,              // 48 hours

    // Bayesian Weighted Rating parameters (IMDb formula)
    BAYESIAN_MIN_VOTES: 300,   // m: minimum votes required to be listed
    BAYESIAN_MEAN_VOTE: 6.5,   // C: mean vote across all items

    // Binge-watching detection threshold (max gap in ms between episodes in the same session)
    BINGE_SESSION_GAP_MS: 24 * 60 * 60 * 1000, // 24 hours
    BINGE_MULTIPLIER: 1.5,  // multiplier applied when binge is detected

    FORCED_FAST_CATALOG_IDS: ['yaca_anime_trending'],
    FORCED_FAST_PRESET_IDS: ['preset_new_movies', 'preset_new_series', 'preset_new_series_eps', 'preset_new_anime', 'preset_new_anime_eps', 'preset_pop_anime'],
    FORCED_SLOW_PRESET_IDS: ['preset_top_rated_movies', 'preset_top_rated_series', 'preset_80s_movies', 'preset_90s_movies', 'preset_00s_movies', 'preset_oscar_winners', 'preset_blockbusters'],
    
    // --- Landscape Configuration ---
    LANDSCAPE_ENABLED_CATALOGS: new Set([
        // Hero Catalogs (Home Page Suggestions)
        'yaca_true_blend_movies',
        'yaca_true_blend_series',
        'yaca_seed_network_movies',
        'yaca_seed_network_series',
        'yaca_hidden_gems_movies',
        'yaca_hidden_gems_series',
        'yaca_trakt_filtered_movies',
        'yaca_trakt_filtered_series',
        // Signature Presets (for users who have them in dashboard)
        'yaca_signature_core_movies',
        'yaca_signature_core_series',
        'yaca_signature_blend_movies',
        'yaca_signature_blend_series',
        'yaca_signature_star_movies',
        'yaca_signature_star_series'
    ]),

    // ─── Pre-warming Configuration ───
    PREWARM_PAGES: [1, 2],  // Which pages to pre-warm on boot
    PREWARM_PRESET_IDS: ['preset_new_movies', 'preset_new_series', 'preset_pop_anime', 'preset_new_anime'],
    
    // Security
    ALLOWED_IMAGE_HOSTS: [
        'image.tmdb.org',
        'media.kitsu.app',
        'walter.trakt.tv',
        'artworks.thetvdb.com',
        'via.placeholder.com'
    ]
};
