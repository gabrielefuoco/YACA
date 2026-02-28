const { createTmdbClient } = require('../clients/tmdb');
const LRUCache = require('../utils/LRUCache');

// Cache limitata in memoria per evitare di chiamare /find troppe volte per gli stessi ID
const memoryCache = new LRUCache({ max: 5000, ttl: 1000 * 60 * 60 * 24 }); // 24 hour TTL

/**
 * Traduce un imdb_id (es. tt1234567) in un tmdb_id usando l'API TMDB /find
 */
async function translateImdbToTmdb(imdbId, tmdbApiKey) {
    // Validate IMDB ID format (tt followed by digits)
    if (!imdbId || !/^tt\d+$/.test(imdbId)) {
        return null;
    }

    if (memoryCache.has(imdbId)) {
        return memoryCache.get(imdbId);
    }

    try {
        const client = createTmdbClient(tmdbApiKey);
        const res = await client.get(`/find/${imdbId}`, {
            params: { external_source: 'imdb_id' }
        });

        const data = res.data;
        let tmdbId = null;
        let type = 'movie';

        if (data.movie_results?.length > 0) {
            tmdbId = data.movie_results[0].id;
            type = 'movie';
        } else if (data.tv_results?.length > 0) {
            tmdbId = data.tv_results[0].id;
            type = 'series';
        }

        if (tmdbId) {
            const result = { id: `tmdb:${tmdbId}`, type };
            memoryCache.set(imdbId, result);
            return result;
        }

        return null;
    } catch (err) {
        console.error(`Errore traduzione IMDB (${imdbId}):`, err.message);
        return null;
    }
}

function clearIdCache() {
    memoryCache.clear();
}

module.exports = { translateImdbToTmdb, clearIdCache };
