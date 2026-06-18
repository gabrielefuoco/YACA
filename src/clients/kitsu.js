const { createAxiosInstance } = require('../utils/httpClient');
const { KITSU_ENDPOINT, ITEMS_PER_PAGE } = require('../config');
const CacheManager = require('../cache/CacheManager');
const { createTmdbClient, prioritizeLocalizedImages } = require('./tmdb');

// Crea l'istanza client qui
const kitsuClient = createAxiosInstance(KITSU_ENDPOINT || 'https://kitsu.io/api/edge');


// Cache per Kitsu
const kitsuMetaCache = new CacheManager('kitsu_meta', { ramMax: 50, ramTtlMs: 3600000 });
const kitsuMappingCache = new CacheManager('kitsu_mapping', { ramMax: 50, ramTtlMs: 3600000 * 24 }); // 24 ore per il mapping
const kitsuEpisodesCache = new CacheManager('kitsu_episodes', { ramMax: 50, ramTtlMs: 3600000 * 12 });
const kitsuTmdbBasicCache = new CacheManager('kitsu_tmdb_basic', { ramMax: 200, ramTtlMs: 3600000 * 24 });

/**
 * Arricchisce un item Kitsu con dati TMDB (titolo localizzato e poster migliori)
 */
async function enrichWithTmdb(item, kitsuId) {
    if (!item) return;
    try {
        const mapping = await getTmdbIdFromKitsuId(kitsuId);
        if (!mapping) return;

        const cacheKey = `${mapping.type}:${mapping.tmdbId}`;
        const { value: cached, status } = await kitsuTmdbBasicCache.getWithStatus(cacheKey);

        let tmdbData = cached;
        if (status === 'miss') {
            const tmdbKey = process.env.TMDB_API_KEY;
            if (!tmdbKey) return;
            const tmdbClient = createTmdbClient(tmdbKey);
            const endpoint = mapping.type === 'movie' ? `/movie/${mapping.tmdbId}` : `/tv/${mapping.tmdbId}`;
            try {
                const tmdbRes = await tmdbClient.get(endpoint, {
                    params: {
                        language: 'it-IT',
                        append_to_response: 'images',
                        include_image_language: 'it,en,null'
                    }
                });
                tmdbData = tmdbRes.data;
                if (tmdbData) {
                    await kitsuTmdbBasicCache.set(cacheKey, tmdbData);
                }
            } catch (e) {
                // Ignore silent failure
            }
        }

        if (tmdbData) {
            const title = tmdbData.title || tmdbData.name;
            if (title) item.name = title;

            let bestPoster = tmdbData.poster_path;
            if (tmdbData.images && Array.isArray(tmdbData.images.posters)) {
                const localizedPosters = prioritizeLocalizedImages(tmdbData.images.posters);
                if (localizedPosters.length > 0) bestPoster = localizedPosters[0].file_path;
            }
            if (bestPoster) item.poster = `https://image.tmdb.org/t/p/w500${bestPoster}`;

            let bestBg = tmdbData.backdrop_path;
            if (tmdbData.images && Array.isArray(tmdbData.images.backdrops)) {
                const localizedBgs = prioritizeLocalizedImages(tmdbData.images.backdrops);
                if (localizedBgs.length > 0) bestBg = localizedBgs[0].file_path;
            }
            if (bestBg) item.background = `https://image.tmdb.org/t/p/w1280${bestBg}`;

            if (tmdbData.overview && tmdbData.overview.trim().length > 0) {
                item.description = tmdbData.overview;
            }
        }
    } catch (e) {
        // Fallback silently to Kitsu data
    }
}

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
        type: attrs.subtype === 'movie' ? 'movie' : 'series',
        name: title,
        poster: attrs.posterImage ? attrs.posterImage.original : null,
        background: attrs.coverImage ? attrs.coverImage.original : null,
        posterShape: 'poster',
        description: attrs.synopsis,
        releaseInfo: year,
        imdbRating: attrs.averageRating ? (parseFloat(attrs.averageRating) / 10).toFixed(1) : null,
        _kitsu_subtype: attrs.subtype
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
            
            // Arricchimento asincrono per tutti i risultati del catalogo
            await Promise.allSettled(items.map(item => {
                const kitsuId = item.id.replace('kitsu:', '');
                return enrichWithTmdb(item, kitsuId);
            }));
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
            // Arricchimento TMDB
            await enrichWithTmdb(meta, kitsuId);

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

/**
 * Risolve un ID TMDB partendo da un ID Kitsu usando l'endpoint mappings.
 */
async function getTmdbIdFromKitsuId(kitsuId) {
    const cacheKey = `kitsu_mapping:${kitsuId}`;
    const { value: cached, status: cacheStatus } = await kitsuMappingCache.getWithStatus(cacheKey);
    if (cacheStatus !== 'miss') return cached;

    try {
        // Fetch mappings specific to this anime
        const res = await kitsuClient.get(`/anime/${kitsuId}/mappings`);
        const mappings = res.data?.data || [];

        // Search for themoviedb mappings
        const tmdbMapping = mappings.find(m => 
            m.attributes?.externalSite === 'themoviedb/tv' || 
            m.attributes?.externalSite === 'themoviedb/movie'
        );

        if (tmdbMapping) {
            const tmdbId = tmdbMapping.attributes.externalId;
            const type = tmdbMapping.attributes.externalSite.includes('tv') ? 'tv' : 'movie';
            const result = { tmdbId, type };
            await kitsuMappingCache.set(cacheKey, result);
            return result;
        }
    } catch (e) {
        console.error(`Errore mapping TMDB per Kitsu ${kitsuId}:`, e.message);
    }
    return null;
}

module.exports = {
    fetchKitsuCatalog,
    getKitsuMetaDetails,
    getKitsuIdFromTmdbId,
    getTmdbIdFromKitsuId,
    fetchKitsuEpisodes
};
