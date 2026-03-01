const { fetchTmdbCatalog, createTmdbClient, getTmdbIdByName } = require('../clients/tmdb');
const { fetchKitsuCatalog } = require('../clients/kitsu');
const { fetchTraktCatalog } = require('../clients/trakt');
const { fetchMDBListItems, parseMDBListItems } = require('../utils/mdblist');
const { routeLiveStremioSearch } = require('../ai/router');
const {
    CACHE_TTL_MS,
    FAST_CACHE_TTL_MS,
    SLOW_CACHE_TTL_MS,
    FORCED_FAST_CATALOG_IDS,
    FORCED_FAST_PRESET_IDS,
    FORCED_SLOW_PRESET_IDS
} = require('../config');

const STREAMING_PROVIDERS = { "netflix": 8, "amazon": 119, "prime": 119, "disney": 337, "apple": 350 };
const FORCED_FAST_CATALOGS = new Set(FORCED_FAST_CATALOG_IDS);
const FORCED_FAST_PRESETS = new Set(FORCED_FAST_PRESET_IDS);
const FORCED_SLOW_PRESETS = new Set(FORCED_SLOW_PRESET_IDS);

// Cataloghi che mostrano episodi recenti (badge numero episodio sul poster)
const EPISODE_CATALOG_IDS = new Set([
    'yaca_preset_preset_new_series_eps',
    'yaca_preset_preset_new_anime_eps'
]);

/**
 * Aggiunge il badge con numero episodio ai poster per cataloghi di episodi recenti.
 * Trova l'ultimo episodio trasmesso e genera l'URL del poster con badge.
 */
function applyEpisodeBadge(metas, hostUrl) {
    const host = hostUrl || process.env.HOST_URL || 'http://localhost:7000';
    const now = new Date();

    for (const meta of metas) {
        if (!meta || !meta.poster || !meta.videos || meta.videos.length === 0) continue;

        // Trova l'ultimo episodio già trasmesso
        const airedEpisodes = meta.videos.filter(v => v.released && new Date(v.released) <= now);
        if (airedEpisodes.length === 0) continue;

        airedEpisodes.sort((a, b) => new Date(b.released) - new Date(a.released));
        const latest = airedEpisodes[0];

        const badgeText = latest.season && latest.season > 1
            ? `S${latest.season}E${latest.episode}`
            : `E${latest.episode || 1}`;

        meta.poster = `${host}/badge/poster.jpg?url=${encodeURIComponent(meta.poster)}&text=${encodeURIComponent(badgeText)}`;
    }
}

function getCatalogCacheTtlMs(catalogId, profileSettings = {}) {
    if (FORCED_FAST_CATALOGS.has(catalogId)) return FAST_CACHE_TTL_MS;
    if (!catalogId.startsWith('yaca_preset_')) return CACHE_TTL_MS;

    const presetId = catalogId.replace('yaca_preset_', '');
    if (FORCED_FAST_PRESETS.has(presetId)) return FAST_CACHE_TTL_MS;
    if (FORCED_SLOW_PRESETS.has(presetId)) return SLOW_CACHE_TTL_MS;
    if (profileSettings.fastPresetRefresh) return FAST_CACHE_TTL_MS;
    return CACHE_TTL_MS;
}

/**
 * Mappa i generi. Se type è TV Series, TMDB ha ID diversi rispetto ai film.
 * Di base, l'AI è istruita per ritornare ID film. Se cerchiamo TV, li mappiamo.
 */
function resolveGenreIds(genreIdsArray, type) {
    if (!genreIdsArray || genreIdsArray.length === 0) return '';
    if (type === 'movie') return genreIdsArray.join(',');

    const MOVIE_TO_TV_MAP = {
        28: 10759, 12: 10759, 16: 16, 35: 35, 80: 80, 99: 99, 18: 18,
        10751: 10751, 14: 10765, 36: 10768, 27: 10765, 10402: 18,
        9648: 9648, 10749: 18, 878: 10765, 53: 80, 10752: 10768, 37: 37
    };

    const mapped = genreIdsArray.map(id => MOVIE_TO_TV_MAP[id]).filter(id => id !== undefined);
    return [...new Set(mapped)].join(',');
}

/**
 * Traduce l'oggetto filtri AI (o salvato a DB) in un oggetto query params per TMDB /discover
 */
async function buildDiscoveryParams(filters, tmdbApiKey, type, baseSettings = {}) {
    const tmdbParams = {
        ...filters, // Spread per far passare le chiavi TMDB dirette usate nei preset
        sort_by: filters.sort_by || 'popularity.desc',
        'vote_count.gte': filters['vote_count.gte'] !== undefined ? filters['vote_count.gte'] : (parseInt(baseSettings.minVoteCount) || 0),
        'vote_average.gte': filters['vote_average.gte'] !== undefined ? filters['vote_average.gte'] : (parseFloat(baseSettings.minVoteAverage) || 0),
        language: filters.language || 'it-IT'
    };

    if (filters.original_language) {
        tmdbParams.with_original_language = filters.original_language;
    }

    // Pulisci le chiavi custom dell'AI per non inviarle sporche a TMDB (opzionale ma pulito)
    delete tmdbParams.strategy;
    delete tmdbParams.similar_to;
    delete tmdbParams.text_search;
    delete tmdbParams.people_list;
    delete tmdbParams.keyword;
    delete tmdbParams.company_name;
    delete tmdbParams.genre_ids;
    delete tmdbParams.year_from;
    delete tmdbParams.year_to;
    delete tmdbParams.runtime_lte;
    delete tmdbParams.runtime_gte;
    delete tmdbParams.watch_provider;
    delete tmdbParams.original_language;
    delete tmdbParams.target;

    if (filters.genre_ids?.length) {
        const finalGenres = resolveGenreIds(filters.genre_ids, type);
        if (finalGenres) tmdbParams.with_genres = finalGenres;
    }

    if (filters.year_from) {
        const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
        tmdbParams[`${dateField}.gte`] = `${filters.year_from}-01-01`;
        if (filters.year_to) tmdbParams[`${dateField}.lte`] = `${filters.year_to}-12-31`;
    }

    if (filters.runtime_lte && type === 'movie') tmdbParams['with_runtime.lte'] = filters.runtime_lte;
    if (filters.runtime_gte && type === 'movie') tmdbParams['with_runtime.gte'] = filters.runtime_gte;

    // Risoluzione ID Asincrona: Persone, Keywords, Compagnie — in parallelo
    const asyncTasks = [];

    if (filters.people_list && filters.people_list.length > 0) {
        asyncTasks.push(
            Promise.allSettled(filters.people_list.map(name => getTmdbIdByName(tmdbApiKey, 'person', name)))
                .then(results => {
                    const valid = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
                    if (valid.length > 0) tmdbParams.with_people = valid.join(',');
                })
        );
    }

    if (filters.keyword && filters.keyword !== 'kdrama') {
        asyncTasks.push(
            getTmdbIdByName(tmdbApiKey, 'keyword', filters.keyword)
                .then(kid => { if (kid) tmdbParams.with_keywords = kid; })
        );
    }

    if (filters.company_name) {
        asyncTasks.push(
            getTmdbIdByName(tmdbApiKey, 'company', filters.company_name)
                .then(cid => { if (cid) tmdbParams.with_companies = cid; })
        );
    }

    await Promise.all(asyncTasks);

    // Provider (Netflix, ecc.)
    if (filters.watch_provider) {
        const pid = STREAMING_PROVIDERS[filters.watch_provider.toLowerCase()];
        if (pid) {
            tmdbParams.with_watch_providers = pid;
            tmdbParams.watch_region = 'IT';
        }
    }

    return tmdbParams;
}

/**
 * Esegue una query complessa determinando la strategia (similar, discovery, search)
 */
async function executeComplexStrategy(filters, tmdbClient, tmdbApiKey, type, skip, settings = {}, cacheOptions = {}) {
    let results = [];
    const searchType = type === 'series' ? 'tv' : 'movie';

    // === STRATEGIA 1: SIMILARITÀ ===
    if (filters.strategy === "similar" && filters.similar_to) {
        const targetId = await getTmdbIdByName(tmdbApiKey, searchType, filters.similar_to);
        if (targetId) {
            results = await fetchTmdbCatalog(
                tmdbClient,
                `/${searchType}/${targetId}/recommendations`,
                skip,
                { language: 'it-IT' },
                type,
                cacheOptions
            );
        }
    }
    // === STRATEGIA 2: RICERCA DIRETTA (Titoli esatti) ===
    else if (filters.strategy === "multi_search") {
        const ep = type === 'movie' ? '/search/movie' : '/search/tv';
        results = await fetchTmdbCatalog(tmdbClient, ep, skip, { query: filters.text_search || filters.keyword }, type, cacheOptions);
    }
    // === STRATEGIA 3: DISCOVERY (Filtri) ===
    else {
        const tmdbParams = await buildDiscoveryParams(filters, tmdbApiKey, type, settings);
        results = await fetchTmdbCatalog(tmdbClient, `/discover/${searchType}`, skip, tmdbParams, type, cacheOptions);
    }

    return results;
}

/**
 * Gestisce la rotta "catalog" inviata da Stremio (es. /catalog/movie/tmdb_discover.json)
 */
async function catalogHandler(args, userConfig, hostUrl) {
    try {
        const { type, id, extra } = args;
        const skip = extra.skip || 0;
        const search = extra.search || null;
        const sortBy = extra.sortBy || null;

        let results = [];

        if (!userConfig) throw new Error("Configurazione utente mancante");

        const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
        if (!tmdbApiKey) throw new Error("TMDB API key mancante nella configurazione utente");

        const mistralKey = userConfig.apiKeys?.mistral || process.env.MISTRAL_API_KEY;
        const tmdbClient = createTmdbClient(tmdbApiKey);

        // Recupera impostazioni del profilo attivo per filtrare spazzatura
        let activeProfileSettings = { minVoteAverage: 0, minVoteCount: 0 };
        if (userConfig.profiles && userConfig.activeProfileId) {
            const profile = userConfig.profiles.find(p => p.id === userConfig.activeProfileId);
            if (profile && profile.settings) {
                activeProfileSettings = profile.settings;
            }
        }
        const cacheOptions = { cacheTtlMs: getCatalogCacheTtlMs(id, activeProfileSettings) };

        // ==========================================
        // SCENARIO 1: RICERCA VIVA TRAMITE BARRA
        // ==========================================
        if (search) {
            if (id === 'yaca_ai_search' || id === 'yaca_ai_search_series') {
                if (!mistralKey) {
                    // Fallback a ricerca TMDB nativa se Mistral non è configurato
                    const ep = type === 'movie' ? '/search/movie' : '/search/tv';
                    results = await fetchTmdbCatalog(tmdbClient, ep, skip, { query: search }, type, cacheOptions);
                } else {
                    // Esegue Mistral live per decidere dove instradare e calcolare i filtri avanzati
                    const routing = await routeLiveStremioSearch(search, mistralKey);

                    if (routing.target === 'kitsu' && type === 'series') {
                        // Anime Search
                        results = await fetchKitsuCatalog('/anime', 0, { filter: { text: routing.query } });
                    } else {
                        // Sfrutta il nuovo esecutore per processare i filtri Mistral
                        results = await executeComplexStrategy(routing.filters, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings, cacheOptions);
                    }
                }
            } else if (id === 'yaca_anime_trending') {
                // Ricerca testuale nativa limitata a Kitsu
                results = await fetchKitsuCatalog('/anime', skip, { filter: { text: search } });
            } else {
                // Ricerca testuale nativa limitata a TMDB (Fallbacks)
                const ep = type === 'movie' ? '/search/movie' : '/search/tv';
                results = await fetchTmdbCatalog(tmdbClient, ep, skip, { query: search }, type, cacheOptions);
            }

            return { metas: results };
        }

        // ==========================================
        // SCENARIO 2: CATALOGHI ESPLORATIVI STANDARD
        // ==========================================
        if (id === 'yaca_discover_movies') {
            const params = { sort_by: sortBy || 'popularity.desc', 'vote_average.gte': activeProfileSettings.minVoteAverage, 'vote_count.gte': activeProfileSettings.minVoteCount };
            results = await fetchTmdbCatalog(tmdbClient, '/discover/movie', skip, params, 'movie', cacheOptions);
            return { metas: results };
        }

        if (id === 'yaca_discover_series') {
            const params = { sort_by: sortBy || 'popularity.desc', 'vote_average.gte': activeProfileSettings.minVoteAverage, 'vote_count.gte': activeProfileSettings.minVoteCount };
            results = await fetchTmdbCatalog(tmdbClient, '/discover/tv', skip, params, 'series', cacheOptions);
            return { metas: results };
        }

        if (id === 'yaca_anime_trending') {
            results = await fetchKitsuCatalog('/anime', skip, { sort: '-popularityRank' });
            return { metas: results };
        }

        // ==========================================
        // SCENARIO 3: CATALOGHI TRAKT
        // ==========================================
        const traktUname = userConfig.apiKeys?.trakt;
        // Contesto per auto-refresh token Trakt (usato solo per endpoint autenticati)
        const refreshContext = (userConfig.apiKeys?.traktRefreshToken && hostUrl)
            ? { userConfig, hostUrl } : null;

        if (id === 'trakt_watchlist_movies' && type === 'movie') {
            results = await fetchTraktCatalog('watchlist_movies', skip, traktUname, tmdbApiKey, refreshContext);
            return { metas: results };
        }
        if (id === 'trakt_watchlist_series' && type === 'series') {
            results = await fetchTraktCatalog('watchlist_shows', skip, traktUname, tmdbApiKey, refreshContext);
            return { metas: results };
        }
        if (id === 'trakt_recommendations_movies' && type === 'movie') {
            results = await fetchTraktCatalog('recommendations_movies', skip, traktUname, tmdbApiKey, refreshContext);
            return { metas: results };
        }
        if (id === 'trakt_recommendations_series' && type === 'series') {
            results = await fetchTraktCatalog('recommendations_shows', skip, traktUname, tmdbApiKey, refreshContext);
            return { metas: results };
        }
        if (id === 'trakt_history_movies' && type === 'movie') {
            results = await fetchTraktCatalog('history_movies', skip, traktUname, tmdbApiKey, refreshContext);
            return { metas: results };
        }
        if (id === 'trakt_history_series' && type === 'series') {
            results = await fetchTraktCatalog('history_shows', skip, traktUname, tmdbApiKey, refreshContext);
            return { metas: results };
        }
        if (id === 'trakt_ratings_movies' && type === 'movie') {
            results = await fetchTraktCatalog('ratings_movies', skip, traktUname, tmdbApiKey, refreshContext);
            return { metas: results };
        }
        if (id === 'trakt_ratings_series' && type === 'series') {
            results = await fetchTraktCatalog('ratings_shows', skip, traktUname, tmdbApiKey, refreshContext);
            return { metas: results };
        }
        if (id === 'trakt_trending_movies' && type === 'movie') {
            results = await fetchTraktCatalog('trending_movies', skip, null, tmdbApiKey);
            return { metas: results };
        }
        if (id === 'trakt_trending_series' && type === 'series') {
            results = await fetchTraktCatalog('trending_shows', skip, null, tmdbApiKey);
            return { metas: results };
        }
        if (id === 'trakt_popular_movies' && type === 'movie') {
            results = await fetchTraktCatalog('popular_movies', skip, null, tmdbApiKey);
            return { metas: results };
        }
        if (id === 'trakt_popular_series' && type === 'series') {
            results = await fetchTraktCatalog('popular_shows', skip, null, tmdbApiKey);
            return { metas: results };
        }
        if (id === 'trakt_favorites_movies' && type === 'movie') {
            results = await fetchTraktCatalog('favorites', skip, traktUname, tmdbApiKey, refreshContext);
            return { metas: results.filter(r => r.type === 'movie') };
        }
        if (id === 'trakt_favorites_series' && type === 'series') {
            results = await fetchTraktCatalog('favorites', skip, traktUname, tmdbApiKey, refreshContext);
            return { metas: results.filter(r => r.type === 'series') };
        }

        // ==========================================
        // SCENARIO 4: CATALOGHI MDBLIST
        // ==========================================
        if (id.startsWith('mdblist_') || id.startsWith('yaca_preset_mdblist_')) {
            const listId = id.replace('yaca_preset_mdblist_', '').replace('mdblist_', '');
            // You can optionally grab an MDBList API key from userConfig if needed, but public lists work without it
            const mdblistKey = userConfig.apiKeys?.mdblist || null;
            const page = Math.floor(skip / 20) + 1;
            const items = await fetchMDBListItems(listId, mdblistKey, 'it', page); // Pass language
            results = await parseMDBListItems(items, type, tmdbApiKey, 'it-IT');
            return { metas: results };
        }

        // ==========================================
        // SCENARIO 5: CATALOGHI CUSTOM AI / PRESET
        // ==========================================
        // Cerchiamo il catalogo prima nel profilo attivo, poi nel fallback globale (per vecchi utenti)
        let customCat = null;
        if (userConfig.profiles && userConfig.activeProfileId) {
            const profile = userConfig.profiles.find(p => p.id === userConfig.activeProfileId);
            if (profile && profile.catalogs) {
                customCat = profile.catalogs.find(c => c.id === id);
            }
        }

        if (!customCat && userConfig.catalogs) {
            customCat = userConfig.catalogs.find(c => c.id === id);
        }

        if (customCat && customCat.filters) {
            // Crea una copia per evitare mutazioni sull'oggetto originale
            const filters = { ...customCat.filters };
            if (!filters.strategy) filters.strategy = 'discovery'; // Retrocompatibilità
            // Applica ordinamento da Stremio se specificato
            if (sortBy) filters.sort_by = sortBy;
            results = await executeComplexStrategy(filters, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings, cacheOptions);
            const withGenres = Array.isArray(filters.with_genres)
                ? filters.with_genres.map(String)
                : String(filters.with_genres ?? '').split(',');
            if (
                (!results || results.length === 0)
                && withGenres.includes('99')
                && filters.with_keywords
            ) {
                const relaxedFilters = { ...filters };
                delete relaxedFilters.with_keywords;
                results = await executeComplexStrategy(relaxedFilters, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings, cacheOptions);
            }

            // Badge episodio sui poster per cataloghi di episodi recenti
            if (EPISODE_CATALOG_IDS.has(id)) {
                applyEpisodeBadge(results, hostUrl);
            }

            return { metas: results };
        }

        return { metas: [] };

    } catch (err) {
        console.error("Errore Catalog Handler:", err.message);
        return { metas: [] };
    }
}

module.exports = { catalogHandler };
