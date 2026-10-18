const { createTmdbClient } = require('./tmdb');
const ImdbToTmdbMapping = require('../models/ImdbToTmdbMapping');

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
        const duckDbStore = require('../indice/duckDbStore');
        const duckResolved = await duckDbStore.resolveImdbIds([imdbId]);
        if (duckResolved && duckResolved[imdbId]) {
            const result = { 
                id: `tmdb:${duckResolved[imdbId].tmdbId}`, 
                type: duckResolved[imdbId].type === 'tv' ? 'series' : 'movie' 
            };
            localCache.set(imdbId, result);
            return result;
        }
    } catch (_err) {}

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

/**
 * Il modello ImdbToTmdbMapping è di QUESTO modulo (map §16: solo il proprietario tocca i suoi modelli).
 * Gli altri moduli leggono da qui, non dal modello.
 */
async function lookupImdbToTmdb(imdbId) {
    if (!imdbId) return null;
    const doc = await ImdbToTmdbMapping.findOne({ imdbId }).lean();
    return doc || null;
}

/**
 * Lettura in blocco: una query per N id.
 * @param {string[]} imdbIds
 * @returns {Promise<Array<{imdbId: string, tmdbId: string, type?: string}>>}
 */
async function lookupImdbToTmdbBatch(imdbIds) {
    if (!Array.isArray(imdbIds) || imdbIds.length === 0) return [];
    return ImdbToTmdbMapping.find({ imdbId: { $in: imdbIds } }).lean();
}

async function clearIdCache() {
    localCache.clear();
}

module.exports = { translateImdbToTmdb, clearIdCache, lookupImdbToTmdb, lookupImdbToTmdbBatch };
