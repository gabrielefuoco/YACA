const axios = require('axios');
const { getTmdbMetaDetails } = require('./tmdb'); // Per arricchire i risultati poveri di Trakt

const traktClient = axios.create({
    baseURL: 'https://api.trakt.tv',
    headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID
    },
    timeout: 10000
});

/**
 * Trasforma l'item Trakt nel formato Meta Stremio e recupera Poster/Sfondo da TMDB se necessario.
 */
async function enhanceTraktItem(traktItem) {
    if (!traktItem) return null;

    // A seconda dell'endpoint, la struttura cambia. Esempio watchlist:
    // { "type": "movie", "movie": { "title": "Batman", "year": 2022, "ids": {"tmdb": 414906} } }
    const isMovie = traktItem.type === 'movie' || !!traktItem.movie;
    const type = isMovie ? 'movie' : 'series';
    const item = traktItem.movie || traktItem.show || traktItem;

    if (!item || !item.ids) return null;

    const tmdbId = item.ids.tmdb;
    const imdbId = item.ids.imdb;

    // L'ID preferito da Stremio è il tmdb:xxx per il nostro addon, o ttXXXXX
    const stremioId = tmdbId ? `tmdb:${tmdbId}` : `tt${imdbId}`;

    const baseMeta = {
        id: stremioId,
        type: type,
        name: item.title,
        releaseInfo: item.year ? item.year.toString() : '',
        description: item.overview || "Metadati completi al click",
        posterShape: 'regular'
    };

    // Optiamo per un arricchimento leggero tramite le API TMDB che già abbiamo (se abbiamo il tmdb_id)
    // per non caricare un muro di "Immagini non disponibili" all'utente.
    if (tmdbId && process.env.TMDB_API_KEY) {
        try {
            const tmdbenrich = await axios.get(`https://api.themoviedb.org/3/${isMovie ? 'movie' : 'tv'}/${tmdbId}`, {
                params: { api_key: process.env.TMDB_API_KEY }
            });
            if (tmdbenrich.data.poster_path) {
                baseMeta.poster = `https://image.tmdb.org/t/p/w500${tmdbenrich.data.poster_path}`;
            }
            if (tmdbenrich.data.backdrop_path) {
                baseMeta.background = `https://image.tmdb.org/t/p/original${tmdbenrich.data.backdrop_path}`;
            }
        } catch (e) { /* Ignora l'arricchimento se fallisce per rate limit */ }
    }

    if (!baseMeta.poster) {
        baseMeta.poster = `https://via.placeholder.com/300x450/1c1c24/8a5aeb?text=${encodeURIComponent(item.title)}`;
    }

    return baseMeta;
}

/**
 * Recupera i cataloghi Trakt in base al Trakt Username o agli endpoint pubblici.
 */
async function fetchTraktCatalog(endpoint, skip = 0, traktUsername = null) {
    if (!process.env.TRAKT_CLIENT_ID) {
        console.error("Missing TRAKT_CLIENT_ID in environment variables");
        return [];
    }

    try {
        const page = Math.floor(skip / 20) + 1; // Trakt usa paginazione standard, default 10, ma usiamo 20 in query
        let results = [];

        // 1. Trending (Pubblico, non serve username)
        if (endpoint === 'trending_movies') {
            const res = await traktClient.get('/movies/trending', { params: { page, limit: 20 } });
            results = res.data;
        }
        else if (endpoint === 'trending_shows') {
            const res = await traktClient.get('/shows/trending', { params: { page, limit: 20 } });
            results = res.data;
        }

        // 2. Watchlist Utente (Richiede Trakt Username e profilo pubblico)
        else if (endpoint === 'watchlist_movies' && traktUsername) {
            const res = await traktClient.get(`/users/${traktUsername}/watchlist/movies`, { params: { sort: 'added', limit: 20 } });
            results = res.data; // È un array di oggetti { listed_at, type, movie: {} }
        }
        else if (endpoint === 'watchlist_shows' && traktUsername) {
            const res = await traktClient.get(`/users/${traktUsername}/watchlist/shows`, { params: { sort: 'added', limit: 20 } });
            results = res.data;
        }

        // 3. Consigliati Utente (Richiede Trakt Username) - Trakt public API lets you get lists, we will map a "Favorites" list if exists or similar,
        // but 'recommendations' without OAuth relies on public lists. Let's provide "Favorites" instead as it works better for public profiles.
        else if (endpoint === 'favorites' && traktUsername) {
            const res = await traktClient.get(`/users/${traktUsername}/lists/favorites/items`, { params: { limit: 20 } });
            results = res.data;
        }

        // Arricchimento asincrono parallelo per non rallentare troppo
        const enrichedItems = await Promise.all(results.map(r => enhanceTraktItem(r)));
        return enrichedItems.filter(i => i !== null);

    } catch (err) {
        console.error(`Errore Trakt Catalog (${endpoint} - User: ${traktUsername}):`, err.response?.data || err.message);
        return [];
    }
}

module.exports = { fetchTraktCatalog };
