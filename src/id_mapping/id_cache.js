const { createTmdbClient } = require('../clients/tmdb');
const ImdbToTmdbMapping = require('../db/models/ImdbToTmdbMapping');

const localCache = new Map();

/**
 * Traduce un imdb_id (es. tt1234567) in un tmdb_id usando l'API TMDB /find
 */
async function translateImdbToTmdb(imdbId, tmdbApiKey) {
    if (!imdbId || !/^tt\d+$/.test(imdbId)) {
        return null;
    }

    if (localCache.has(imdbId)) {
        const val = localCache.get(imdbId);
        return val === 'NOT_FOUND' ? null : val;
    }

    try {
        const dbMapping = await ImdbToTmdbMapping.findOne({ imdbId }).lean();
        if (dbMapping) {
            const result = { id: dbMapping.tmdbId, type: dbMapping.type };
            localCache.set(imdbId, result);
            return result.id === 'NOT_FOUND' ? null : result;
        }
    } catch (err) {
        console.warn(`[translateImdbToTmdb] Errore DB per ${imdbId}:`, err.message);
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
            localCache.set(imdbId, result);
            
            try {
                await ImdbToTmdbMapping.updateOne(
                    { imdbId },
                    { $set: { tmdbId: result.id, type } },
                    { upsert: true }
                );
            } catch(e) {}

            return result;
        }

        localCache.set(imdbId, 'NOT_FOUND');
        try {
            await ImdbToTmdbMapping.updateOne(
                { imdbId },
                { $set: { tmdbId: 'NOT_FOUND', type: 'unknown' } },
                { upsert: true }
            );
        } catch(e) {}

        return null;
    } catch (err) {
        console.error(`Errore traduzione IMDB (${imdbId}):`, err.message);
        return null;
    }
}

async function clearIdCache() {
    localCache.clear();
}

module.exports = { translateImdbToTmdb, clearIdCache };
