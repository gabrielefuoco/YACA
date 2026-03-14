const { createAxiosInstance } = require('../utils/httpClient');
const { KITSU_ENDPOINT, ITEMS_PER_PAGE } = require('../config');
const CacheManager = require('../cache/CacheManager');

// Crea l'istanza client qui
const kitsuClient = createAxiosInstance(KITSU_ENDPOINT || 'https://kitsu.io/api/edge');


// Cache per Kitsu
const kitsuMetaCache = new CacheManager('kitsu_meta', { ramMax: 50, ramTtlMs: 3600000 });
const kitsuMappingCache = new CacheManager('kitsu_mapping', { ramMax: 50, ramTtlMs: 3600000 * 24 }); // 24 ore per il mapping
const kitsuEpisodesCache = new CacheManager('kitsu_episodes', { ramMax: 50, ramTtlMs: 3600000 * 12 });

/**
 * Trasforma il risultato raw di Kitsu nel formato Stremio Meta Preview.
 */
function toStremioMetaItem(kitsuItem) {
    if (!kitsuItem || !kitsuItem.attributes) return null;

    const attrs = kitsuItem.attributes;
    const id = `kitsu:${kitsuItem.id}`;

    // Kitsu fornisce vari titoli (en, en_jp, ja_jp, it). Scegliamo user-friendly con priorità italiano.
    const title = attrs.titles?.it || attrs.titles?.en || attrs.titles?.en_jp || attrs.canonicalTitle || 'Titolo sconosciuto';
    const year = attrs.startDate ? attrs.startDate.split('-')[0] : '';

    return {
        id,
        type: 'series',
        name: title,
        poster: attrs.posterImage ? attrs.posterImage.original : null,
        background: attrs.coverImage ? attrs.coverImage.original : null,
        posterShape: 'poster',
        description: attrs.synopsis,
        releaseInfo: year,
        imdbRating: attrs.averageRating ? (parseFloat(attrs.averageRating) / 10).toFixed(1) : null
    };
}

/**
 * Fetch cataloghi Anime da Kitsu con Offset basato su skip.
 * Kitsu supporta direttamente l'offset, a differenza delle pagine di TMDB.
 */
async function fetchKitsuCatalog(endpoint, skip = 0, customParams = {}) {
    try {
        const params = {
            'page[limit]': ITEMS_PER_PAGE, // Kitsu Max is 20
            'page[offset]': skip,
            ...customParams
        };

        const res = await kitsuClient.get(endpoint, { params });

        let items = [];
        if (res.data && res.data.data) {
            items = res.data.data.map(toStremioMetaItem).filter(i => i !== null);
        }

        return items;
    } catch (err) {
        console.error(`Errore Kitsu Catalog (${endpoint}):`, err.message);
        return [];
    }
}

/**
 * Recupera l'elenco degli episodi per un Anime e li formatta per Stremio
 */
async function fetchKitsuEpisodes(kitsuId) {
    const cacheKey = `eps:${kitsuId}`;
    const { value: cached, status: cacheStatus } = await kitsuEpisodesCache.getWithStatus(cacheKey);
    if (cacheStatus !== 'miss') return cached;

    try {
        const firstRes = await kitsuClient.get(`/anime/${kitsuId}/episodes`, {
            params: { 'page[limit]': 20, 'page[offset]': 0 }
        });

        if (!firstRes.data || !firstRes.data.data) return [];

        let allData = [...firstRes.data.data];
        const totalCount = firstRes.data.meta?.count || 0;

        if (totalCount > 20) {
            const promises = [];
            // Cap to reasonable max to avoid abusing API (e.g. 1000 episodes)
            const maxOffsets = Math.min(totalCount, 1000);
            for (let offset = 20; offset < maxOffsets; offset += 20) {
                promises.push(
                    kitsuClient.get(`/anime/${kitsuId}/episodes`, {
                        params: { 'page[limit]': 20, 'page[offset]': offset }
                    }).then(r => r.data?.data || []).catch(e => {
                        console.error(`Errore offset ${offset} episodi Kitsu ${kitsuId}:`, e.message);
                        return [];
                    })
                );
            }
            const results = await Promise.all(promises);
            for (const resData of results) {
                allData = allData.concat(resData);
            }
        }

        const episodes = allData.map(ep => {
            const attrs = ep.attributes;
            // Kitsu often lists episodes with a seasonNumber or we can infer it if strictly mapped
            // However, for Stremio, we need to decide if we keep absolute or split.
            // By default, Kitsu returns absolute numbers. We keep them but allow future season mapping.
            const season = attrs.seasonNumber || 1; 
            
            return {
                id: `kitsu:${kitsuId}:${season}:${attrs.number}`,
                title: attrs.titles?.it || attrs.titles?.en || attrs.titles?.en_jp || `Episodio ${attrs.number}`,
                released: attrs.airdate ? new Date(attrs.airdate).toISOString() : null,
                season: season,
                episode: attrs.number,
                overview: attrs.synopsis || '',
                thumbnail: attrs.thumbnail ? attrs.thumbnail.original : null
            };
        });

        if (episodes.length > 0) {
            await kitsuEpisodesCache.set(cacheKey, episodes);
        }
        return episodes;
    } catch (e) {
        console.error("Errore fetchKitsuEpisodes:", e.message);
        return [];
    }
}

/**
 * Fetch Meta completo (utile per MetaHandler di Stremio)
 */
async function getKitsuMetaDetails(id) {
    const kitsuId = id.replace('kitsu:', '').trim();

    if (!/^\d+$/.test(kitsuId)) {
        console.error(`ID Kitsu non valido: ${kitsuId}`);
        return null;
    }

    const { value: cached, status: cacheStatus } = await kitsuMetaCache.getWithStatus(kitsuId);
    if (cacheStatus !== 'miss') return cached;

    try {
        const res = await kitsuClient.get(`/anime/${kitsuId}`);
        const item = res.data.data;
        const meta = toStremioMetaItem(item);

        if (meta && item.attributes) {
            meta.genres = [];
            if (item.attributes.youtubeVideoId) {
                meta.trailers = [{ source: item.attributes.youtubeVideoId, type: 'Trailer' }];
            }
            if (item.attributes.subtype !== 'movie') {
                meta.videos = await fetchKitsuEpisodes(kitsuId);
                meta.type = 'series';
            }
            await kitsuMetaCache.set(kitsuId, meta);
        }
        return meta;
    } catch (err) {
        console.error("Errore Kitsu Meta:", err.message);
        return null;
    }
}

/**
 * Risolve un ID Kitsu partendo da un ID TMDB usando l'endpoint mappings.
 */
async function getKitsuIdFromTmdbId(tmdbId, type = 'series') {
    const cacheKey = `tmdb_mapping:${tmdbId}`;
    const { value: cached, status: cacheStatus } = await kitsuMappingCache.getWithStatus(cacheKey);
    if (cacheStatus !== 'miss') return cached;

    try {
        const site = type === 'movie' ? 'themoviedb/movie' : 'themoviedb/tv';
        const res = await kitsuClient.get('/mappings', {
            params: {
                'filter[externalSite]': site,
                'filter[externalId]': tmdbId
            }
        });

        const kitsuId = res.data?.data?.[0]?.relationships?.item?.data?.id;
        if (kitsuId) {
            await kitsuMappingCache.set(cacheKey, kitsuId);
            return kitsuId;
        }
    } catch (e) {
        console.error(`Errore mapping Kitsu per TMDB ${tmdbId}:`, e.message);
    }
    return null;
}

module.exports = {
    fetchKitsuCatalog,
    getKitsuMetaDetails,
    getKitsuIdFromTmdbId,
    fetchKitsuEpisodes
};
