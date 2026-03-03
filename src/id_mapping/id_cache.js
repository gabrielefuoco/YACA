const { createTmdbClient } = require('../clients/tmdb');
const CacheManager = require('../cache/CacheManager');

// Cache limitata per evitare di chiamare /find troppe volte per gli stessi ID
const memoryCache = new CacheManager('imdb_to_tmdb', {
    ramMax: 5000,
    ramTtlMs: 1000 * 60 * 60 * 24, // 24h RAM
    mongoTtlMs: 1000 * 60 * 60 * 24 * 7 // 7d MongoDB
});

/**
 * Traduce un imdb_id (es. tt1234567) in un tmdb_id usando l'API TMDB /find
 */
async function translateImdbToTmdb(imdbId, tmdbApiKey) {
    // Validate IMDB ID format (tt followed by digits)
    if (!imdbId || !/^tt\d+$/.test(imdbId)) {
        return null;
    }

    const cached = await memoryCache.get(imdbId);
    if (cached) {
        return cached;
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
            await memoryCache.set(imdbId, result);
            return result;
        }

        return null;
    } catch (err) {
        console.error(`Errore traduzione IMDB (${imdbId}):`, err.message);
        return null;
    }
}

async function clearIdCache() {
    await memoryCache.clear();
}

module.exports = { translateImdbToTmdb, clearIdCache };
