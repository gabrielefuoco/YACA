const axios = require('axios');
const LRUCache = require('../utils/LRUCache');
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

const idNameCache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 60 }); // 1 hour TTL

/**
 * Traduce una stringa (es. nome attore o keyword) nel suo ID TMDB effettuando una fetch al volo
 */
async function getTmdbIdByName(apiKey, endpoint, query) {
    if (!query) return null;
    const cacheKey = `${endpoint}:${query.toLowerCase()}`;
    if (idNameCache.has(cacheKey)) return idNameCache.get(cacheKey);

    try {
        const client = createTmdbClient(apiKey);
        const res = await client.get(`/search/${endpoint}`, { params: { query } });
        const id = res.data?.results?.[0]?.id || null;
        if (id) idNameCache.set(cacheKey, id);
        return id;
    } catch (e) {
        console.error(`Errore getTmdbIdByName (${endpoint} - ${query}):`, e.message);
        return null;
    }
}

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
        name: tmdbItem.title || tmdbItem.name || 'Titolo sconosciuto',
        poster: tmdbItem.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}` : null,
        background: tmdbItem.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbItem.backdrop_path}` : null,
        posterShape: 'poster',
        description: tmdbItem.overview,
        releaseInfo: year,
        imdbRating: tmdbItem.vote_average ? parseFloat(tmdbItem.vote_average).toFixed(1) : null
    };
}

/**
 * Recupera un listato dinamico (discover) o una query di ricerca e si preoccupa
 * di parallelizzare le pagine TMDB per riempire lo skip di Stremio.
 */
async function fetchTmdbCatalog(client, endpoint, skip, customParams = {}, type = 'movie') {
    const startPage = Math.floor((skip || 0) / ITEMS_PER_PAGE) + 1;
    const promises = [];

    // Fetcha N pagine simultaneamente per popolare Stremio più fluidamente (solo se skip è 0 per velocità iniziale)
    // Se skip > 0 carichiamo una pagina alla volta per evitare salti o duplicati
    const pagesToFetch = (skip === 0) ? PAGES_PER_REQUEST : 1;

    for (let i = 0; i < pagesToFetch; i++) {
        const pageParams = { ...customParams, page: startPage + i };
        promises.push(client.get(endpoint, { params: pageParams }));
    }

    try {
        const results = await Promise.allSettled(promises);
        const items = [];

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
 * Recupera le stagioni e gli episodi per una Serie TV da TMDB
 */
async function fetchTmdbEpisodes(client, tmdbId, totalSeasons) {
    try {
        const promises = [];
        // TMDB Seasons are 1-indexed. Sometimes there is Season 0 (Specials).
        // For performance, we fetch up to the most recent 5 seasons if a show is huge.
        const startSeason = totalSeasons > 5 ? totalSeasons - 4 : 1;

        for (let i = startSeason; i <= totalSeasons; i++) {
            promises.push(client.get(`/tv/${tmdbId}/season/${i}`));
        }

        const results = await Promise.allSettled(promises);
        const videos = [];

        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value?.data?.episodes) {
                const seasonData = res.value.data;
                seasonData.episodes.forEach(ep => {
                    videos.push({
                        id: `tmdb:${tmdbId}:${ep.season_number}:${ep.episode_number}`,
                        title: ep.name || `Episodio ${ep.episode_number}`,
                        released: ep.air_date ? new Date(ep.air_date).toISOString() : null,
                        season: ep.season_number,
                        episode: ep.episode_number,
                        overview: ep.overview || '',
                        thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null
                    });
                });
            }
        });

        return videos;
    } catch (e) {
        console.error("Errore fetchTmdbEpisodes:", e.message);
        return [];
    }
}

/**
 * Ottiene i dettagli completi per il Meta Handler di Stremio
 */
async function getTmdbMetaDetails(apiKey, id, type) {
    const client = createTmdbClient(apiKey);
    const tmdbId = id.replace('tmdb:', '').trim();

    // Validate tmdbId is a number to prevent path injection
    if (!/^\d+$/.test(tmdbId)) {
        console.error(`ID TMDB non valido: ${tmdbId}`);
        return null;
    }

    const endpoint = type === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;

    try {
        const res = await client.get(endpoint, {
            // Include videos (trailers) and images (for logos)
            // also we can append credits for cast
            params: { append_to_response: 'videos,credits,images', include_image_language: 'it,en,null' }
        });

        const data = res.data;
        if (!data) return null;
        const meta = toStremioMetaItem(data, type);
        if (!meta) return null;

        // Aggiungiamo metadati avanzati
        if (data.credits && data.credits.cast) {
            meta.cast = data.credits.cast.slice(0, 10).map(c => c.name);
        }
        if (data.genres) {
            meta.genres = data.genres.map(g => g.name);
        }
        if (data.runtime) {
            meta.runtime = `${data.runtime}m`;
        }

        // Troviamo il ClearLogo (il logo col nome del film trasparente)
        if (data.images && data.images.logos && data.images.logos.length > 0) {
            // Preferiamo quello in italiano, se non c'è prendiamo il primo disponibile (in genere inglese)
            const itLogo = data.images.logos.find(l => l.iso_639_1 === 'it');
            const targetLogo = itLogo || data.images.logos[0];
            meta.logo = `https://image.tmdb.org/t/p/w500${targetLogo.file_path}`;
        }

        // Troviamo i trailer (YouTube) e formattiamoli secondo le specifiche Stremio
        if (data.videos && data.videos.results) {
            const trailers = data.videos.results.filter(v => v.site === 'YouTube' && v.type === 'Trailer');
            if (trailers.length > 0) {
                // Stremio supports array of { source: "youtubeId", type: "Trailer" }
                meta.trailers = trailers.map(t => ({ source: t.key, type: t.type }));
            }
        }

        // Se è una serie TV, scarica gli episodi per popolare la griglia in Stremio
        if (type === 'series' && data.number_of_seasons) {
            meta.videos = await fetchTmdbEpisodes(client, tmdbId, data.number_of_seasons);
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
    getTmdbMetaDetails,
    getTmdbIdByName
};
