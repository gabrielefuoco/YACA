// src/config.js
module.exports = {
    // API Endpoints
    TMDB_ENDPOINT: 'https://api.themoviedb.org/3',

    // Paginators & Timeouts
    PAGES_PER_REQUEST: 3, // How many TMDB pages to fetch concurrently per Stremio request
    ITEMS_PER_PAGE: 20,   // Default items per page for TMDB
    // Quanti titoli per pagina di catalogo o di ricerca: venti, la prassi di Stremio e di TMDB.
    // Il limite che l'utente vedeva non era questo numero: era che il catalogo di ricerca non
    // dichiarava `skip`, quindi Stremio non chiedeva **mai** la pagina successiva e i venti erano
    // tutti (corretto in a8a56bd2). Con `skip` dichiarato la lista si scorre a pagine, come per
    // ogni altro addon. Configurabile con CATALOG_PAGE_SIZE se serve una pagina più grande.
    CATALOG_PAGE_SIZE: Number(process.env.CATALOG_PAGE_SIZE) > 0 ? Number(process.env.CATALOG_PAGE_SIZE) : 20,

    // Default Fallbacks
    DEFAULT_REGION: 'IT',
    DEFAULT_LANGUAGE: 'it-IT',

    // ─── Cache dei cataloghi (L1 RAM + L2 Redis) ───
    // Un solo TTL di partenza; le finestre più strette (watchlist, daily window, simulcast) le
    // applica `catalogHandler` con un `Math.min`.
    CACHE_TTL_MS: 14 * 24 * 60 * 60 * 1000, // 14 giorni (default)

    // ─── Metadata Cache (single items) ───
    // Movies (completed)
    MOVIE_META_CACHE_TTL_MS: 14 * 24 * 60 * 60 * 1000,     // 14 days L2
    // Series (ongoing / anime)
    SERIES_META_CACHE_TTL_MS: 6 * 60 * 60 * 1000,           // 6 hours L2
    SERIES_META_SWR_MS: 30 * 60 * 1000,                     // dichiarato in tmdbBudget, non applicato

    // Cache Hybrid Recommendations
    RECOMMENDATIONS_CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000,  // 7 giorni

    // Rating Configuration
    // Bayesian Weighted Rating parameters (IMDb formula)
    BAYESIAN_MIN_VOTES: 300,   // m: minimum votes required to be listed
    BAYESIAN_MEAN_VOTE: 6.5    // C: mean vote across all items
};
