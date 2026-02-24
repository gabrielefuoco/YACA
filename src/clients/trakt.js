const { createAxiosInstance } = require('../utils/httpClient');
const axios = require('axios'); // still needed for raw TMDB enrich requests if we don't want proxy there, but let's use it

const traktClient = createAxiosInstance('https://api.trakt.tv', {
    headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID
    }
});

/**
 * Trasforma l'item Trakt nel formato Meta Stremio e recupera Poster/Sfondo da TMDB se necessario.
 * @param {Object} traktItem - L'item raw da Trakt
 * @param {string} [tmdbApiKey] - Chiave TMDB dell'utente per l'arricchimento immagini
 */
async function enhanceTraktItem(traktItem, tmdbApiKey) {
    if (!traktItem) return null;

    // A seconda dell'endpoint, la struttura cambia. Esempio watchlist:
    // { "type": "movie", "movie": { "title": "Batman", "year": 2022, "ids": {"tmdb": 414906} } }
    const isMovie = traktItem.type === 'movie' || !!traktItem.movie;
    const type = isMovie ? 'movie' : 'series';
    const item = traktItem.movie || traktItem.show || traktItem;

    if (!item || !item.ids) return null;

    const tmdbId = item.ids.tmdb;
    const imdbId = item.ids.imdb;

    // L'ID preferito per la compatibilità con addon di streaming è l'IMDB ID (tt*)
    // Per Torrentio è FONDAMENTALE usare l'IMDB ID (ttXXXX) se disponibile!
    if (!tmdbId && !imdbId) return null;
    const stremioId = imdbId || (tmdbId ? `tmdb:${tmdbId}` : null);

    const baseMeta = {
        id: stremioId,
        type: type,
        name: item.title || 'Titolo sconosciuto',
        releaseInfo: item.year ? item.year.toString() : '',
        description: item.overview || "Metadati completi al click",
        posterShape: 'poster'
    };

    // Aggiunge il rating dell'utente se presente (da endpoint ratings)
    if (traktItem.rating) {
        baseMeta.imdbRating = traktItem.rating.toFixed(1);
    }

    // Arricchimento immagini via TMDB - usa la chiave dell'utente (fallback a env globale)
    const enrichKey = tmdbApiKey || process.env.TMDB_API_KEY;
    if (tmdbId && enrichKey) {
        try {
            const tmdbenrich = await axios.get(`https://api.themoviedb.org/3/${isMovie ? 'movie' : 'tv'}/${tmdbId}`, {
                params: { api_key: enrichKey },
                timeout: 5000
            });
            if (tmdbenrich.data.poster_path) {
                baseMeta.poster = `https://image.tmdb.org/t/p/w500${tmdbenrich.data.poster_path}`;
            }
            if (tmdbenrich.data.backdrop_path) {
                const bgUrl = `https://image.tmdb.org/t/p/original${tmdbenrich.data.backdrop_path}`;
                baseMeta.background = bgUrl;
                // Add blurred background hint for clients that support it
                const host = process.env.HOST_URL || 'http://localhost:7000';
                baseMeta.behaviorHints = { ...baseMeta.behaviorHints, backgroundBlur: `${host}/blur?url=${encodeURIComponent(bgUrl)}` };
            }
        } catch (_e) { /* Ignora l'arricchimento se fallisce per rate limit */ }
    }

    if (!baseMeta.poster) {
        baseMeta.poster = `https://via.placeholder.com/300x450/1c1c24/8a5aeb?text=${encodeURIComponent(baseMeta.name)}`;
    }

    return baseMeta;
}

/**
 * Recupera i cataloghi Trakt in base al Trakt Token OAuth o agli endpoint pubblici.
 * @param {string} endpoint - Tipo di catalogo Trakt da caricare
 * @param {number} skip - Offset per la paginazione Stremio
 * @param {string} [traktToken] - Token OAuth Trakt dell'utente
 * @param {string} [tmdbApiKey] - Chiave TMDB dell'utente per arricchire i poster
 */
async function fetchTraktCatalog(endpoint, skip = 0, traktToken = null, tmdbApiKey = null) {
    if (!process.env.TRAKT_CLIENT_ID) {
        console.error("Missing TRAKT_CLIENT_ID in environment variables");
        return [];
    }

    try {
        const page = Math.floor(skip / 20) + 1;
        let results = [];

        // === ENDPOINT PUBBLICI (Non richiedono username) ===

        if (endpoint === 'trending_movies') {
            const res = await traktClient.get('/movies/trending', { params: { page, limit: 20 } });
            results = res.data;
        }
        else if (endpoint === 'trending_shows') {
            const res = await traktClient.get('/shows/trending', { params: { page, limit: 20 } });
            results = res.data;
        }
        else if (endpoint === 'popular_movies') {
            const res = await traktClient.get('/movies/popular', { params: { page, limit: 20 } });
            // /movies/popular ritorna direttamente array di movie objects (senza wrapper)
            results = res.data.map(m => ({ type: 'movie', movie: m }));
        }
        else if (endpoint === 'popular_shows') {
            const res = await traktClient.get('/shows/popular', { params: { page, limit: 20 } });
            results = res.data.map(s => ({ type: 'show', show: s }));
        }

        // === ENDPOINT UTENTE (Richiedono OAuth Token) ===
        const authConfig = traktToken ? { headers: { 'Authorization': `Bearer ${traktToken}` } } : {};

        if (endpoint === 'watchlist_movies' && traktToken) {
            const res = await traktClient.get(`/users/me/watchlist/movies`, { ...authConfig, params: { sort: 'added', limit: 20, page } });
            results = res.data;
        }
        else if (endpoint === 'watchlist_shows' && traktToken) {
            const res = await traktClient.get(`/users/me/watchlist/shows`, { ...authConfig, params: { sort: 'added', limit: 20, page } });
            results = res.data;
        }

        // Cronologia recente (ultimi titoli guardati)
        else if (endpoint === 'history_movies' && traktToken) {
            const res = await traktClient.get(`/users/me/history/movies`, { ...authConfig, params: { limit: 20, page } });
            results = res.data;
        }
        else if (endpoint === 'history_shows' && traktToken) {
            const res = await traktClient.get(`/users/me/history/shows`, { ...authConfig, params: { limit: 20, page } });
            results = res.data;
        }

        // Valutazioni dell'utente (ordinati per rating decrescente)
        else if (endpoint === 'ratings_movies' && traktToken) {
            const res = await traktClient.get(`/users/me/ratings/movies`, { ...authConfig, params: { limit: 20, page } });
            results = res.data;
        }
        else if (endpoint === 'ratings_shows' && traktToken) {
            const res = await traktClient.get(`/users/me/ratings/shows`, { ...authConfig, params: { limit: 20, page } });
            results = res.data;
        }

        // Raccomandazioni personali basate sulla cronologia
        else if (endpoint === 'recommendations_movies' && traktToken) {
            const res = await traktClient.get(`/recommendations/movies`, { ...authConfig, params: { limit: 20, page } });
            // Le recommendations ritornano direttamente movie objects
            results = res.data.map(m => ({ type: 'movie', movie: m }));
        }
        else if (endpoint === 'recommendations_shows' && traktToken) {
            const res = await traktClient.get(`/recommendations/shows`, { ...authConfig, params: { limit: 20, page } });
            results = res.data.map(s => ({ type: 'show', show: s }));
        }

        // Favorites (lista custom "favorites")
        else if (endpoint === 'favorites' && traktToken) {
            const res = await traktClient.get(`/users/me/lists/favorites/items`, { ...authConfig, params: { limit: 20, page } });
            results = res.data;
        }

        // Deduplica per ID (history può avere duplicati per rewatch)
        const seenIds = new Set();
        const dedupedResults = results.filter(r => {
            const item = r.movie || r.show || r;
            const id = item?.ids?.tmdb || item?.ids?.imdb;
            if (!id || seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
        });

        // Arricchimento asincrono parallelo con TMDB key dell'utente
        const enrichedItems = await Promise.all(dedupedResults.map(r => enhanceTraktItem(r, tmdbApiKey)));
        return enrichedItems.filter(i => i !== null);

    } catch (err) {
        const status = err.response?.status;
        if (status === 404) {
            console.error(`Trakt: endpoint non trovato (${endpoint})`);
        } else if (status === 401 || status === 403) {
            console.error(`Trakt: accesso negato (${endpoint}). Token scaduto o non valido.`);
        } else {
            console.error(`Errore Trakt Catalog (${endpoint}):`, err.response?.data || err.message);
        }
        return [];
    }
}

module.exports = { fetchTraktCatalog };
