const { fetchTmdbCatalog, createTmdbClient } = require('../clients/tmdb');
const { fetchKitsuCatalog } = require('../clients/kitsu');
const { routeLiveStremioSearch } = require('../ai/router');
const UserConfig = require('../models/UserConfig');

/**
 * Gestisce la rotta "catalog" inviata da Stremio (es. /catalog/movie/tmdb_discover.json)
 */
async function catalogHandler(args, userUuid) {
    try {
        const { type, id, extra } = args;
        const skip = extra.skip || 0;
        const search = extra.search || null;

        let results = [];

        // 1. Recupera la config dell'utente dal Database (ci servono API keys e liste salvate)
        const userConfig = await UserConfig.findOne({ uuid: userUuid });
        if (!userConfig) throw new Error("Utente o config non trovata nel DB");

        const tmdbApiKey = userConfig.apiKeys.tmdb;
        const mistralKey = userConfig.apiKeys.mistral;
        const tmdbClient = createTmdbClient(tmdbApiKey);

        // ==========================================
        // SCENARIO 1: RICERCA VIVA TRAMITE BARRA
        // ==========================================
        if (search) {
            if (id === 'yaca_ai_search') {
                // Esegue Mistral live per decidere dove instradare
                const routing = await routeLiveStremioSearch(search, mistralKey);

                if (routing.target === 'kitsu') {
                    results = await fetchKitsuCatalog('/anime', 0, { filter: { text: routing.query } });
                } else {
                    // Fallback a TMDB. (Mistral ha generato un topic, facciamo una query libera /search/movie)
                    // (Nota: Per semplicità stiamo cercando solo film, per serie andrebbe fatto multi-search)
                    const searchRes = await fetchTmdbCatalog(tmdbClient, '/search/movie', skip, { query: routing.query || search }, type);
                    results = searchRes;
                }
            } else if (id === 'yaca_anime_trending') {
                // Ricerca testuale nativa limitata a Kitsu
                results = await fetchKitsuCatalog('/anime', skip, { filter: { text: search } });
            } else {
                // Ricerca testuale nativa limitata a TMDB
                const ep = type === 'movie' ? '/search/movie' : '/search/tv';
                results = await fetchTmdbCatalog(tmdbClient, ep, skip, { query: search }, type);
            }

            return { metas: results };
        }

        // ==========================================
        // SCENARIO 2: CATALOGHI ESPLORATIVI STANDARD
        // ==========================================
        if (id === 'yaca_discover_movies') {
            results = await fetchTmdbCatalog(tmdbClient, '/discover/movie', skip, { sort_by: 'popularity.desc' }, 'movie');
            return { metas: results };
        }

        if (id === 'yaca_discover_series') {
            results = await fetchTmdbCatalog(tmdbClient, '/discover/tv', skip, { sort_by: 'popularity.desc' }, 'series');
            return { metas: results };
        }

        if (id === 'yaca_anime_trending') {
            results = await fetchKitsuCatalog('/anime', skip, { sort: '-popularityRank' });
            return { metas: results };
        }

        // ==========================================
        // SCENARIO 3: CATALOGHI CUSTOM AI
        // ==========================================
        // Verifichiamo se l'ID richiesto combacia con uno dei cataloghi generati
        const customCat = userConfig.catalogs.find(c => c.id === id);
        if (customCat && customCat.filters) {
            // Esegue direttamente una query Discover pura in TMDB usando i filtri "congelati" pre-calcolati
            results = await fetchTmdbCatalog(tmdbClient, '/discover/movie', skip, customCat.filters, 'movie');
            return { metas: results };
        }

        return { metas: [] };

    } catch (err) {
        console.error("Errore Catalog Handler:", err.message);
        return { metas: [] };
    }
}

module.exports = { catalogHandler };
