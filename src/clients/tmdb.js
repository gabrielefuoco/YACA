const axios = require('axios');
const { TMDB_ENDPOINT, DEFAULT_LANGUAGE, DEFAULT_REGION, PAGES_PER_REQUEST, ITEMS_PER_PAGE } = require('../config');

// Helper interno per costruire oggetti request TMDB
const createTmdbClient = (apiKey) => axios.create({
    baseURL: TMDB_ENDPOINT,
    params: {
        api_key: apiKey,
        language: DEFAULT_LANGUAGE,
        region: DEFAULT_REGION
    },
    timeout: 10000
});

/**
 * Trasforma il risultato raw di TMDB nel formato Stremio Meta Preview.
 */
function toStremioMetaItem(tmdbItem, type) {
    if (!tmdbItem) return null;

    const id = `tmdb:${tmdbItem.id}`;
    const year = tmdbItem.release_date ? tmdbItem.release_date.split('-')[0] : (tmdbItem.first_air_date ? tmdbItem.first_air_date.split('-')[0] : '');

    return {
        id,
        type: type === 'movie' ? 'movie' : 'series',
        name: tmdbItem.title || tmdbItem.name,
        poster: tmdbItem.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}` : null,
        background: tmdbItem.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbItem.backdrop_path}` : null,
        posterShape: 'regular',
        description: tmdbItem.overview,
        releaseInfo: year,
        imdbRating: tmdbItem.vote_average ? tmdbItem.vote_average.toString() : null
    };
}

/**
 * Recupera un listato dinamico (discover) o una query di ricerca e si preoccupa
 * di parallelizzare le pagine TMDB per riempire lo skip di Stremio.
 */
async function fetchTmdbCatalog(client, endpoint, skip, customParams = {}, type = 'movie') {
    const startPage = Math.floor((skip || 0) / ITEMS_PER_PAGE) + 1;
    const promises = [];

    // Fetcha N pagine simultaneamente (di base 3 pagine => 60 item) per popolare Stremio più fluidamente
    for (let i = 0; i < PAGES_PER_REQUEST; i++) {
        const pageParams = { ...customParams, page: startPage + i };
        promises.push(client.get(endpoint, { params: pageParams }));
    }

    try {
        const results = await Promise.allSettled(promises);
        let items = [];

        // Uniamo e deduplichiamo
        const seenIds = new Set();

        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value?.data?.results) {
                for (const item of res.value.data.results) {
                    if (!seenIds.has(item.id)) {
                        seenIds.add(item.id);
                        const mapped = toStremioMetaItem(item, type);
                        if (mapped) items.push(mapped);
                    }
                }
            } else if (res.status === 'rejected') {
                console.error(`Errore in una sub-query TMDB (${endpoint}):`, res.reason?.message);
            }
        });

        return items;
    } catch (err) {
        console.error(`Errore fetchTmdbCatalog ${endpoint}:`, err.message);
        return [];
    }
}

/**
 * Ottiene i dettagli completi per il Meta Handler di Stremio
 */
async function getTmdbMetaDetails(apiKey, id, type) {
    const client = createTmdbClient(apiKey);
    const tmdbId = id.replace('tmdb:', '');
    const endpoint = type === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;

    try {
        const res = await client.get(endpoint, {
            params: { append_to_response: 'videos,credits' }
        });

        const data = res.data;
        const meta = toStremioMetaItem(data, type);

        // Aggiungiamo metadati avanzati
        if (data.credits && data.credits.cast) {
            meta.cast = data.credits.cast.slice(0, 5).map(c => c.name);
        }
        if (data.genres) {
            meta.genres = data.genres.map(g => g.name);
        }
        if (data.runtime) {
            meta.runtime = `${data.runtime} min`;
        }

        // Troviamo il trailer (YouTube)
        if (data.videos && data.videos.results) {
            const trailer = data.videos.results.find(v => v.site === 'YouTube' && v.type === 'Trailer');
            if (trailer) {
                meta.trailers = [{ source: trailer.key, type: 'Trailer' }];
            }
        }

        return meta;

    } catch (err) {
        console.error("Errore TMDB Meta:", err.message);
        return null;
    }
}

module.exports = {
    createTmdbClient, // Esportato in caso serva passare chiavi specifiche
    fetchTmdbCatalog,
    getTmdbMetaDetails
};
