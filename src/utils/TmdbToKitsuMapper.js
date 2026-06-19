const axios = require('axios');
const CacheManager = require('../cache/CacheManager');

// 30 days TTL per il mapping (raramente cambia)
const mappingCache = new CacheManager('tmdb_to_kitsu', {
    ramMax: 5000,
    ramTtlMs: 2592000000, // 30 giorni in ram (se sopravvive)
    mongoTtlMs: 2592000000 // 30 giorni
});

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

    // Identifica quali item sono potenzialmente Anime e hanno un ID TMDB
    // Un item è anime se:
    // - Ha with_keywords con 210024 (Anime)
    // - Oppure nei genre_ids c'è 16 (Animation) E origin_country include 'JP'
    // Dato che qui tmdbItems sono i RISULTATI (oggetti movie/tv), controlliamo i loro attributi.
    const isAnime = (item) => {
        if (!item) return false;
        if (String(item.id).startsWith('kitsu:')) return false; // Già Kitsu
        
        const isAnimation = item.genre_ids && item.genre_ids.includes(16);
        const isJapanese = item.origin_country && item.origin_country.includes('JP');
        const isOriginalJapanese = item.original_language === 'ja';

        return isAnimation && (isJapanese || isOriginalJapanese);
    };

    const animeItems = tmdbItems.filter(isAnime);

    if (animeItems.length === 0) return tmdbItems;

    // Traduzione in batch per non sovraccaricare le API
    await rateLimitedMap(
        animeItems,
        async (item) => {
            const rawTmdbId = String(item.id).replace('tmdb:', '');
            const kitsuId = await getKitsuIdFromTmdb(rawTmdbId, apiKey);
            if (kitsuId) {
                item.tmdbId = rawTmdbId; // Salviamo il TMDB originale per ERDB
                item.id = `kitsu:${kitsuId}`; // Sovrascrive l'ID!
            }
        },
        { batchSize: 5, delayMs: 100 } // Massimo rispetto per rate limit TMDB e Kitsu
    );

    return tmdbItems;
}

/**
 * Dato un TMDB ID (tv), cerca l'ID Kitsu corrispondente
 * Flusso: TMDB ID -> TVDB ID -> Kitsu ID
 */
async function getKitsuIdFromTmdb(tmdbId, tmdbApiKey) {
    const cacheKey = `tmdb_to_kitsu_${tmdbId}`;
    const cached = await mappingCache.get(cacheKey);
    if (cached) {
        if (cached === 'NOT_FOUND') return null;
        return cached;
    }

    const apiKey = tmdbApiKey || TMDB_API_KEY;
    if (!apiKey) {
        console.warn(`[getKitsuIdFromTmdb] Manca la TMDB API KEY.`);
        return null;
    }

    try {
        // 1. Chiedi External IDs a TMDB
        const extRes = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}/external_ids`, {
            params: { api_key: apiKey }
        });
        const tvdbId = extRes.data.tvdb_id;

        if (!tvdbId) {
            await mappingCache.set(cacheKey, 'NOT_FOUND');
            return null;
        }

        // 2. Chiedi Mapping a Kitsu (usiamo thetvdb come ponte)
        const mapRes = await axios.get(`https://kitsu.io/api/edge/mappings`, {
            params: {
                'filter[externalSite]': 'thetvdb',
                'filter[externalId]': tvdbId,
                'include': 'item'
            }
        });

        if (mapRes.data && mapRes.data.data && mapRes.data.data.length > 0) {
            const mappedItem = mapRes.data.data[0];
            const kitsuId = mappedItem.relationships?.item?.data?.id;
            
            if (kitsuId) {
                await mappingCache.set(cacheKey, kitsuId);
                return kitsuId;
            }
        }

        // Se non trova il mapping, prova con thetvdb/series o thetvdb/season
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
                const kitsuId = fbRes.data.data[0].relationships?.item?.data?.id;
                if (kitsuId) {
                    await mappingCache.set(cacheKey, kitsuId);
                    return kitsuId;
                }
            }
        }

        // Non trovato
        await mappingCache.set(cacheKey, 'NOT_FOUND');
        return null;
    } catch (err) {
        console.error(`[TmdbToKitsuMapper] Errore conversione ID per TMDB ${tmdbId}:`, err.message);
        return null;
    }
}

module.exports = {
    translateAnimeIdsToKitsu,
    getKitsuIdFromTmdb
};
