const { fetchTmdbCatalog, createTmdbClient, getTmdbIdByName } = require('../clients/tmdb');
const { fetchKitsuCatalog } = require('../clients/kitsu');
const { fetchTraktCatalog } = require('../clients/trakt');
const { routeLiveStremioSearch } = require('../ai/router');
const UserConfig = require('../models/UserConfig');

const STREAMING_PROVIDERS = { "netflix": 8, "amazon": 119, "prime": 119, "disney": 337, "apple": 350 };

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

    // Risoluzione ID Asincrona: Persone
    if (filters.people_list && filters.people_list.length > 0) {
        const peopleIds = [];
        for (const name of filters.people_list) {
            const pid = await getTmdbIdByName(tmdbApiKey, 'person', name);
            if (pid) peopleIds.push(pid);
        }
        if (peopleIds.length > 0) tmdbParams.with_people = peopleIds.join(',');
    }

    // Risoluzione ID Asincrona: Keywords
    if (filters.keyword && filters.keyword !== 'kdrama') {
        const kid = await getTmdbIdByName(tmdbApiKey, 'keyword', filters.keyword);
        if (kid) tmdbParams.with_keywords = kid;
    }

    // Risoluzione ID Asincrona: Compagnie (es. Disney, Ghibli)
    if (filters.company_name) {
        const cid = await getTmdbIdByName(tmdbApiKey, 'company', filters.company_name);
        if (cid) tmdbParams.with_companies = cid;
    }

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
async function executeComplexStrategy(filters, tmdbClient, tmdbApiKey, type, skip, settings = {}) {
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
                type
            );
        }
    }
    // === STRATEGIA 2: RICERCA DIRETTA (Titoli esatti) ===
    else if (filters.strategy === "multi_search") {
        const ep = type === 'movie' ? '/search/movie' : '/search/tv';
        results = await fetchTmdbCatalog(tmdbClient, ep, skip, { query: filters.text_search || filters.keyword }, type);
    }
    // === STRATEGIA 3: DISCOVERY (Filtri) ===
    else {
        const tmdbParams = await buildDiscoveryParams(filters, tmdbApiKey, type, settings);
        results = await fetchTmdbCatalog(tmdbClient, `/discover/${searchType}`, skip, tmdbParams, type);
    }

    return results;
}

/**
 * Gestisce la rotta "catalog" inviata da Stremio (es. /catalog/movie/tmdb_discover.json)
 */
async function catalogHandler(args, userUuid) {
    try {
        const { type, id, extra } = args;
        const skip = extra.skip || 0;
        const search = extra.search || null;
        const sortBy = extra.sortBy || null;

        let results = [];

        // 1. Recupera la config dell'utente dal Database (ci servono API keys e liste salvate)
        const userConfig = await UserConfig.findOne({ uuid: userUuid });
        if (!userConfig) throw new Error("Utente o config non trovata nel DB");

        const tmdbApiKey = userConfig.apiKeys?.tmdb;
        if (!tmdbApiKey) throw new Error("TMDB API key mancante nella configurazione utente");

        const mistralKey = userConfig.apiKeys?.mistral;
        const tmdbClient = createTmdbClient(tmdbApiKey);

        // Recupera impostazioni del profilo attivo per filtrare spazzatura
        let activeProfileSettings = { minVoteAverage: 0, minVoteCount: 0 };
        if (userConfig.profiles && userConfig.activeProfileId) {
            const profile = userConfig.profiles.find(p => p.id === userConfig.activeProfileId);
            if (profile && profile.settings) {
                activeProfileSettings = profile.settings;
            }
        }

        // ==========================================
        // SCENARIO 1: RICERCA VIVA TRAMITE BARRA
        // ==========================================
        if (search) {
            if (id === 'yaca_ai_search' || id === 'yaca_ai_search_series') {
                if (!mistralKey) {
                    // Fallback a ricerca TMDB nativa se Mistral non è configurato
                    const ep = type === 'movie' ? '/search/movie' : '/search/tv';
                    results = await fetchTmdbCatalog(tmdbClient, ep, skip, { query: search }, type);
                } else {
                    // Esegue Mistral live per decidere dove instradare e calcolare i filtri avanzati
                    const routing = await routeLiveStremioSearch(search, mistralKey);

                    if (routing.target === 'kitsu' && type === 'series') {
                        // Anime Search
                        results = await fetchKitsuCatalog('/anime', 0, { filter: { text: routing.query } });
                    } else {
                        // Sfrutta il nuovo esecutore per processare i filtri Mistral
                        results = await executeComplexStrategy(routing.filters, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings);
                    }
                }
            } else if (id === 'yaca_anime_trending') {
                // Ricerca testuale nativa limitata a Kitsu
                results = await fetchKitsuCatalog('/anime', skip, { filter: { text: search } });
            } else {
                // Ricerca testuale nativa limitata a TMDB (Fallbacks)
                const ep = type === 'movie' ? '/search/movie' : '/search/tv';
                results = await fetchTmdbCatalog(tmdbClient, ep, skip, { query: search }, type);
            }

            return { metas: results };
        }

        // ==========================================
        // SCENARIO 2: CATALOGHI ESPLORATIVI STANDARD
        // ==========================================
        if (id === 'yaca_discover_movies') {
            const params = { sort_by: sortBy || 'popularity.desc', 'vote_average.gte': activeProfileSettings.minVoteAverage, 'vote_count.gte': activeProfileSettings.minVoteCount };
            results = await fetchTmdbCatalog(tmdbClient, '/discover/movie', skip, params, 'movie');
            return { metas: results };
        }

        if (id === 'yaca_discover_series') {
            const params = { sort_by: sortBy || 'popularity.desc', 'vote_average.gte': activeProfileSettings.minVoteAverage, 'vote_count.gte': activeProfileSettings.minVoteCount };
            results = await fetchTmdbCatalog(tmdbClient, '/discover/tv', skip, params, 'series');
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

        if (id === 'trakt_watchlist_movies' && type === 'movie') {
            results = await fetchTraktCatalog('watchlist_movies', skip, traktUname, tmdbApiKey);
            return { metas: results };
        }
        if (id === 'trakt_watchlist_series' && type === 'series') {
            results = await fetchTraktCatalog('watchlist_shows', skip, traktUname, tmdbApiKey);
            return { metas: results };
        }
        if (id === 'trakt_recommendations_movies' && type === 'movie') {
            results = await fetchTraktCatalog('recommendations_movies', skip, traktUname, tmdbApiKey);
            return { metas: results };
        }
        if (id === 'trakt_recommendations_series' && type === 'series') {
            results = await fetchTraktCatalog('recommendations_shows', skip, traktUname, tmdbApiKey);
            return { metas: results };
        }
        if (id === 'trakt_history_movies' && type === 'movie') {
            results = await fetchTraktCatalog('history_movies', skip, traktUname, tmdbApiKey);
            return { metas: results };
        }
        if (id === 'trakt_history_series' && type === 'series') {
            results = await fetchTraktCatalog('history_shows', skip, traktUname, tmdbApiKey);
            return { metas: results };
        }
        if (id === 'trakt_ratings_movies' && type === 'movie') {
            results = await fetchTraktCatalog('ratings_movies', skip, traktUname, tmdbApiKey);
            return { metas: results };
        }
        if (id === 'trakt_ratings_series' && type === 'series') {
            results = await fetchTraktCatalog('ratings_shows', skip, traktUname, tmdbApiKey);
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
            results = await fetchTraktCatalog('favorites', skip, traktUname, tmdbApiKey);
            return { metas: results.filter(r => r.type === 'movie') };
        }
        if (id === 'trakt_favorites_series' && type === 'series') {
            results = await fetchTraktCatalog('favorites', skip, traktUname, tmdbApiKey);
            return { metas: results.filter(r => r.type === 'series') };
        }

        // ==========================================
        // SCENARIO 4: CATALOGHI CUSTOM AI / PRESET
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
            // Esegue i filtri salvati a database sfruttando il Discovery Builder
            if (!customCat.filters.strategy) customCat.filters.strategy = 'discovery'; // Retrocompatibilità
            // Applica ordinamento da Stremio se specificato
            if (sortBy) customCat.filters.sort_by = sortBy;
            results = await executeComplexStrategy(customCat.filters, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings);
            return { metas: results };
        }

        return { metas: [] };

    } catch (err) {
        console.error("Errore Catalog Handler:", err.message);
        return { metas: [] };
    }
}

module.exports = { catalogHandler };
