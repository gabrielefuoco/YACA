const axios = require('axios');
const TmdbToKitsuMapping = require('../db/models/TmdbToKitsuMapping');

// Semplice cache in RAM per risparmiare query a Mongo nel ciclo di vita
const localCache = new Map();

const TMDB_API_KEY = process.env.TMDB_API_KEY;

/**
 * Converte un array di risultati TMDB (es. ritornati da AiDiscoveryProvider)
 * e, per tutti quelli che sono anime, rimpiazza l'ID tmdb con l'ID kitsu:.
 * @param {Array} tmdbItems I risultati grezzi di TMDB prima del formatter
 * @returns {Array} Array con ID corretti
 */
async function translateAnimeIdsToKitsu(tmdbItems, tmdbApiKey) {
    if (!tmdbItems || !Array.isArray(tmdbItems)) return tmdbItems;

    const { rateLimitedMap } = require('./rateLimiter');
    const apiKey = tmdbApiKey || TMDB_API_KEY;

    const isAnime = (item) => {
        if (!item) return false;
        if (String(item.id).startsWith('kitsu:')) return false;
        
        const isAnimation = item.genre_ids && item.genre_ids.includes(16);
        const isJapanese = item.origin_country && item.origin_country.includes('JP');
        const isOriginalJapanese = item.original_language === 'ja';

        return isAnimation && (isJapanese || isOriginalJapanese);
    };

    const animeItems = tmdbItems.filter(isAnime);

    if (animeItems.length === 0) return tmdbItems;

    await rateLimitedMap(
        animeItems,
        async (item) => {
            const rawTmdbId = String(item.id).replace('tmdb:', '');
            const kitsuId = await getKitsuIdFromTmdb(rawTmdbId, apiKey);
            if (kitsuId) {
                item.tmdbId = rawTmdbId;
                item.id = `kitsu:${kitsuId}`;
            }
        },
        { batchSize: 5, delayMs: 100 }
    );

    return tmdbItems;
}

/**
 * Dato un TMDB ID (tv), cerca l'ID Kitsu corrispondente
 */
async function getKitsuIdFromTmdb(tmdbId, tmdbApiKey) {
    const key = String(tmdbId);
    
    // 1. In-memory
    if (localCache.has(key)) {
        const val = localCache.get(key);
        return val === 'NOT_FOUND' ? null : val;
    }

    // 2. MongoDB
    try {
        const dbMapping = await TmdbToKitsuMapping.findOne({ tmdbId: key }).lean();
        if (dbMapping) {
            localCache.set(key, dbMapping.kitsuId);
            return dbMapping.kitsuId === 'NOT_FOUND' ? null : dbMapping.kitsuId;
        }
    } catch (err) {
        console.warn(`[TmdbToKitsuMapper] Errore DB per ${key}:`, err.message);
    }

    const apiKey = tmdbApiKey || TMDB_API_KEY;
    if (!apiKey) return null;

    let kitsuId = null;

    try {
        const extRes = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}/external_ids`, {
            params: { api_key: apiKey }
        });
        const tvdbId = extRes.data.tvdb_id;

        if (tvdbId) {
            const mapRes = await axios.get(`https://kitsu.io/api/edge/mappings`, {
                params: {
                    'filter[externalSite]': 'thetvdb',
                    'filter[externalId]': tvdbId,
                    'include': 'item'
                }
            });

            if (mapRes.data && mapRes.data.data && mapRes.data.data.length > 0) {
                kitsuId = mapRes.data.data[0].relationships?.item?.data?.id;
            } else {
                const fallbackSites = ['thetvdb/series', 'thetvdb/season'];
                for (const site of fallbackSites) {
                    const fbRes = await axios.get(`https://kitsu.io/api/edge/mappings`, {
                        params: {
                            'filter[externalSite]': site,
                            'filter[externalId]': tvdbId,
                            'include': 'item'
                        }
                    });
                    if (fbRes.data && fbRes.data.data && fbRes.data.data.length > 0) {
                        kitsuId = fbRes.data.data[0].relationships?.item?.data?.id;
                        if (kitsuId) break;
                    }
                }
            }
        }

        const finalResult = kitsuId || 'NOT_FOUND';
        localCache.set(key, finalResult);
        
        try {
            await TmdbToKitsuMapping.updateOne(
                { tmdbId: key },
                { $set: { kitsuId: finalResult } },
                { upsert: true }
            );
        } catch (e) {}

        return kitsuId;

    } catch (err) {
        console.error(`[TmdbToKitsuMapper] Errore API per TMDB ${tmdbId}:`, err.message);
        return null;
    }
}

/**
 * Funzione inversa: per tutti gli item con ID kitsu:, li traduce in ID IMDb (tt) o tmdb:.
 */
async function translateAnimeIdsToImdb(items, tmdbApiKey) {
    if (!items || !Array.isArray(items)) return items;

    const { rateLimitedMap } = require('./rateLimiter');
    const { getTmdbIdFromKitsuId } = require('../clients/kitsu');
    const { resolveImdbId } = require('../clients/tmdb');

    const kitsuItems = items.filter(item => String(item.id).startsWith('kitsu:'));
    if (kitsuItems.length === 0) return items;

    await rateLimitedMap(
        kitsuItems,
        async (item) => {
            const kitsuId = String(item.id).replace('kitsu:', '').replace('_ita_offset', '');
            if (!kitsuId) return;

            try {
                const mapping = await getTmdbIdFromKitsuId(kitsuId);
                if (!mapping || !mapping.tmdbId) return;

                item.tmdbId = mapping.tmdbId;

                const imdbId = await resolveImdbId(mapping.tmdbId, 'tv', tmdbApiKey);
                if (imdbId) {
                    item.id = imdbId;
                } else {
                    item.id = `tmdb:${mapping.tmdbId}`;
                }
            } catch (err) {
                console.error(`[translateAnimeIdsToImdb] Errore per kitsu:${kitsuId}:`, err.message);
            }
        },
        { batchSize: 5, delayMs: 100 }
    );

    return items;
}

module.exports = {
    translateAnimeIdsToKitsu,
    translateAnimeIdsToImdb
};
