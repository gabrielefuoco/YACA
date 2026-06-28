const { createAxiosInstance } = require('../utils/httpClient');
const {
    TMDB_ENDPOINT,
    DEFAULT_LANGUAGE,
    DEFAULT_REGION,
    PAGES_PER_REQUEST,
    ITEMS_PER_PAGE,
    SERIES_META_CACHE_TTL_MS,
    SERIES_META_SWR_MS,
    MOVIE_META_CACHE_TTL_MS,
    MOVIE_META_SWR_MS,
    MOVIE_DETAILS_TTL_MS,
    SERIES_FINISHED_TTL_MS,
    SERIES_ONGOING_TTL_MS,
    CACHE_TTL_MS,
    FAST_CATALOG_PAGE1_L2_TTL_MS,
    FAST_CATALOG_PAGE1_SWR_MS,
    FAST_CATALOG_DEEP_L2_TTL_MS,
    FAST_CATALOG_DEEP_SWR_MS,
    SLOW_CATALOG_L2_TTL_MS,
    SLOW_CATALOG_SWR_MS
} = require('../config');
const { rateLimitedMap } = require('../utils/rateLimiter');
const { generateRequestHash } = require('../utils/requestHash');
const TmdbRequestCache = require('../models/TmdbRequestCache');


const CacheManager = require('../cache/CacheManager');

// Costanti di trimming per ridurre il peso dei payload TMDB in cache (anti-OOM / anti-16MB BSON)
const MAX_CAST_SIZE = 10;
const MAX_CREW_SIZE = 5;
const MAX_IMAGES_PER_TYPE = 3;
const MAX_TRAILERS = 3;
const KEY_CREW_ROLES = ['Director', 'Writer', 'Screenplay', 'Author', 'Creator'];

const TMDB_MIRRORS = [
    TMDB_ENDPOINT,
    'https://tmdb.org/3',
    'https://api.tmdb.org/3'
];
let currentMirrorIdx = 0;
const MAX_MIRROR_RETRIES = TMDB_MIRRORS.length;

// Helper interno per costruire oggetti request TMDB con failover
const createTmdbClient = (apiKey) => {
    const client = createAxiosInstance(TMDB_ENDPOINT, {
        baseURL: TMDB_MIRRORS[currentMirrorIdx],
        params: {
            api_key: apiKey,
            language: DEFAULT_LANGUAGE,
            region: DEFAULT_REGION
        },
        timeout: 20000
    });

    client.interceptors.response.use(res => res, async (err) => {
        if (err.code === 'ECONNABORTED' || (err.response && err.response.status >= 500)) {
            const retryCount = err.config._mirrorRetryCount || 0;
            if (retryCount >= MAX_MIRROR_RETRIES) {
                return Promise.reject(err);
            }
            console.warn(`TMDB mirror ${TMDB_MIRRORS[currentMirrorIdx]} failed, switching...`);
            currentMirrorIdx = (currentMirrorIdx + 1) % TMDB_MIRRORS.length;
            err.config.baseURL = TMDB_MIRRORS[currentMirrorIdx];
            err.config.url = err.config.url.replace(/^(https?:\/\/[^\/]+)/, TMDB_MIRRORS[currentMirrorIdx]);
            err.config._mirrorRetryCount = retryCount + 1;
            return client.request(err.config);
        }
        return Promise.reject(err);
    });

    return client;
};

const idNameCache = new CacheManager('tmdb_id_name', { ramMax: 500, ramTtlMs: 1000 * 60 * 60, mongoTtlMs: 1000 * 60 * 60 });
const imdbIdCache = new CacheManager('tmdb_imdb_id', { ramMax: 500, ramTtlMs: 1000 * 60 * 60 * 24 * 7, mongoTtlMs: 1000 * 60 * 60 * 24 * 7 });
const movieMetaCache = new CacheManager('tmdb_movie_meta', { ramMax: 500, ramTtlMs: MOVIE_META_CACHE_TTL_MS, mongoTtlMs: MOVIE_META_CACHE_TTL_MS, swrMs: MOVIE_META_SWR_MS });
const seriesMetaCache = new CacheManager('tmdb_series_meta', { ramMax: 500, ramTtlMs: SERIES_META_CACHE_TTL_MS, mongoTtlMs: SERIES_META_CACHE_TTL_MS, swrMs: SERIES_META_SWR_MS });
const tvEpisodesCache = new CacheManager('tmdb_episodes', { ramMax: 500, ramTtlMs: SERIES_META_CACHE_TTL_MS, mongoTtlMs: SERIES_META_CACHE_TTL_MS, swrMs: SERIES_META_SWR_MS });

/**
 * Traduce una stringa (es. nome attore o keyword) nel suo ID TMDB effettuando una fetch al volo
 */
async function getTmdbIdByName(apiKey, endpoint, query) {
    if (!query) return null;
    const cacheKey = `${endpoint}:${query.toLowerCase()}`;
    const { value: cached, status: cacheStatus } = await idNameCache.getWithStatus(cacheKey);
    if (cacheStatus !== 'miss') return cached;

    try {
        const client = createTmdbClient(apiKey);
        const res = await client.get(`/search/${endpoint}`, { params: { query } });
        const results = res.data?.results || [];
        let id = null;
        if (results.length > 0) {
            const exactMatch = results.find(r => r.name && r.name.toLowerCase() === query.toLowerCase());
            id = exactMatch ? exactMatch.id : results[0].id;
        }
        // Cache sia dei risultati positivi che negativi (null)
        await idNameCache.set(cacheKey, id);
        return id;
    } catch (e) {
        if (e.response?.status === 404) {
            await idNameCache.set(cacheKey, null, 86400000); // Negative cache 24h
        }
        console.error(`Errore getTmdbIdByName (${endpoint} - ${query}):`, e.message);
        return null;
    }
}

/**
 * Risolve l'IMDB ID per un dato TMDB ID usando l'endpoint external_ids (con cache).
 * Essenziale per la compatibilità con addon di streaming come Torrentio.
 */
async function resolveImdbId(tmdbId, type, apiKey) {
    const cacheKey = `imdb:${type}:${tmdbId}`;
    const { value: cached, status: cacheStatus } = await imdbIdCache.getWithStatus(cacheKey);
    if (cacheStatus !== 'miss') return cached;

    try {
        const client = createTmdbClient(apiKey);
        const searchType = type === 'movie' ? 'movie' : 'tv';
        const res = await client.get(`/${searchType}/${tmdbId}/external_ids`);
        const imdbId = res.data?.imdb_id || null;
        // Cache sia dei risultati positivi che negativi (null)
        await imdbIdCache.set(cacheKey, imdbId);
        return imdbId;
    } catch (e) {
        if (e.response?.status === 404) {
            await imdbIdCache.set(cacheKey, null, 86400000); // Negative cache 24h
        }
        return null;
    }
}

/**
 * Converte ISO 3166-1 alpha-2 in emoji bandiera
 */
function getCountryEmoji(countryCode) {
    if (!countryCode) return '';
    return countryCode
        .toUpperCase()
        .replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

/**
 * Formatta una descrizione ricca in stile "Technical Card" per Stremio
 */
function formatRichDescription(data, type, ratings = {}) {
    if (!data.overview) return '';
    return data.overview;
}


/**
 * Helper per calcolare il runtime in formato stringa
 */
function metaRuntime(data, type) {
    if (type === 'movie' && data.runtime) return `${data.runtime}m`;
    if (type === 'series' && data.episode_run_time?.length > 0) return `${data.episode_run_time[0]}m`;
    return null;
}

function pickPosterPath(tmdbItem) {
    const posters = tmdbItem?.images?.posters;
    if (!Array.isArray(posters) || posters.length === 0) {
        return tmdbItem.poster_path || null;
    }

    const itPoster = posters.find(p => p.iso_639_1 === 'it');
    const enPoster = posters.find(p => p.iso_639_1 === 'en');
    const nullPoster = posters.find(p => !p.iso_639_1);
    const preferredPoster = itPoster || enPoster || nullPoster || posters[0];

    return preferredPoster?.file_path || tmdbItem.poster_path || null;
}

function prioritizeLocalizedImages(images = []) {
    if (!Array.isArray(images)) {
        return images;
    }

    // Always prioritize even if array is small!
    const prioritized = [
        ...images.filter(img => img && img.iso_639_1 === 'it'),
        ...images.filter(img => img && img.iso_639_1 === 'en'),
        ...images.filter(img => img && !img.iso_639_1),
        ...images.filter(img => img && img.iso_639_1 && img.iso_639_1 !== 'it' && img.iso_639_1 !== 'en')
    ];

    // Remove duplicates if any
    const uniquePrioritized = Array.from(new Set(prioritized));

    return uniquePrioritized.slice(0, typeof MAX_IMAGES_PER_TYPE !== 'undefined' ? MAX_IMAGES_PER_TYPE : 10);
}

/**
 * Trasforma il risultato raw di TMDB nel formato Stremio Meta Preview.
 */
function toStremioMetaItem(tmdbItem, type) {
    if (!tmdbItem) return null;

    const imdbId = (tmdbItem.external_ids && tmdbItem.external_ids.imdb_id) ? tmdbItem.external_ids.imdb_id : null;
    const id = imdbId || `tmdb:${tmdbItem.id}`;

    // Anno e Range Anni per Serie
    let year = tmdbItem.release_date ? tmdbItem.release_date.split('-')[0] : (tmdbItem.first_air_date ? tmdbItem.first_air_date.split('-')[0] : '');
    if (type === 'tv' && tmdbItem.status === 'Ended' && tmdbItem.last_air_date) {
        const endYear = tmdbItem.last_air_date.split('-')[0];
        if (endYear && endYear !== year) year = `${year}-${endYear}`;
    }

    // Rilevamento "Al Cinema" (Theatrical)
    let isTheatrical = false;
    if (type === 'movie' && tmdbItem.release_dates?.results) {
        const itReleases = tmdbItem.release_dates.results.find(r => r.iso_3166_1 === 'IT');
        if (itReleases) {
            // Type 3 = Theatrical, Type 2 = Limited
            isTheatrical = itReleases.release_dates.some(rd => rd.type === 3);
        }
    }

    const name = tmdbItem.title || tmdbItem.name || 'Titolo sconosciuto';
    const posterPath = pickPosterPath(tmdbItem);

    const meta = {
        id,
        imdb_id: imdbId, // Native flag for badges
        type: type === 'movie' ? 'movie' : 'series',
        name: name,
        inTheaters: isTheatrical,
        poster: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null,
        background: tmdbItem.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbItem.backdrop_path}` : null,
        posterShape: 'poster',
        description: tmdbItem.overview,
        releaseInfo: year,
        imdbRating: tmdbItem.vote_average ? parseFloat(tmdbItem.vote_average).toFixed(1) : null,
        genre_ids: tmdbItem.genre_ids || (tmdbItem.genres ? tmdbItem.genres.map(g => g.id) : []),
        behaviorHints: type === 'movie'
            ? { defaultVideoId: id }
            : { hasScheduledVideos: true }
    };

    // Sintetizza l'ultimo episodio per i badge se disponibile (Series)
    if (type === 'tv' && tmdbItem.last_episode_to_air) {
        const last = tmdbItem.last_episode_to_air;
        meta.videos = [{
            id: imdbId ? `${imdbId}:${last.season_number}:${last.episode_number}` : `tmdb:${tmdbItem.id}:${last.season_number}:${last.episode_number}`,
            season: last.season_number,
            episode: last.episode_number,
            released: last.air_date ? new Date(last.air_date).toISOString() : null
        }];
    }

    // Campi Nativi per Link di Ricerca su Stremio
    if (tmdbItem.genres) {
        meta.genres = tmdbItem.genres.map(g => g.name);
    }

    if (tmdbItem.credits?.cast) {
        meta.cast = tmdbItem.credits.cast.filter(c => c.known_for_department === 'Acting').slice(0, 5).map(c => c.name);
    }

    if (type === 'movie' && tmdbItem.credits?.crew) {
        meta.director = tmdbItem.credits.crew.filter(c => c.job === 'Director').slice(0, 3).map(d => d.name);
    } else if (type === 'series' && tmdbItem.created_by?.length > 0) {
        meta.writer = tmdbItem.created_by.slice(0, 3).map(c => c.name);
    }


    // Deep Links nativi
    meta.links = [];

    // Trailer e Stream info nativa
    if (tmdbItem.videos?.results) {
        const trailers = tmdbItem.videos.results
            .filter(v => v.site === 'YouTube' && v.type === 'Trailer')
            .map(v => ({ source: v.key, type: 'Trailer' }));
        if (trailers.length > 0) meta.trailers = trailers;
    }

    // Generi
    if (tmdbItem.genres) {
        for (const g of tmdbItem.genres) {
            meta.links.push({ name: g.name, category: 'Generi', url: `stremio:///search?search=${encodeURIComponent(g.name)}` });
        }
    }

    // Regia / Creatori
    if (type === 'movie' && tmdbItem.credits?.crew) {
        const directors = tmdbItem.credits.crew.filter(c => c.job === 'Director').slice(0, 3);
        for (const d of directors) {
            meta.links.push({ name: d.name, category: 'Regia', url: `stremio:///search?search=${encodeURIComponent(d.name)}` });
        }
    } else if (type === 'series' && tmdbItem.created_by?.length > 0) {
        for (const c of tmdbItem.created_by.slice(0, 3)) {
            meta.links.push({ name: c.name, category: 'Creato da', url: `stremio:///search?search=${encodeURIComponent(c.name)}` });
        }
    }

    // Cast (primi 5)
    if (tmdbItem.credits?.cast) {
        for (const c of tmdbItem.credits.cast.slice(0, 5)) {
            meta.links.push({ name: c.name, category: 'Cast', url: `stremio:///search?search=${encodeURIComponent(c.name)}` });
        }
    }

    // Keywords (Temi)
    const kwList = type === 'movie' ? tmdbItem.keywords?.keywords : tmdbItem.keywords?.results;
    if (kwList && kwList.length > 0) {
        for (const k of kwList.slice(0, 5)) {
            meta.links.push({ name: k.name, category: 'Tema', url: `stremio:///search?search=${encodeURIComponent(k.name)}` });
        }
    }

    // Saga
    if (tmdbItem.belongs_to_collection) {
        meta.links.push({ name: tmdbItem.belongs_to_collection.name, category: 'Saga', url: `stremio:///search?search=${encodeURIComponent(tmdbItem.belongs_to_collection.name)}` });
    }

    if (type === 'series' && tmdbItem.networks) {
        for (const n of tmdbItem.networks) {
            meta.links.push({ name: n.name, category: 'Network', url: `stremio:///search?search=${encodeURIComponent(n.name)}` });
        }
    }

    // Official Socials & Links
    if (tmdbItem.external_ids) {
        const ids = tmdbItem.external_ids;
        if (ids.imdb_id) meta.links.push({ name: 'IMDb', category: 'ID Esterni', url: `https://www.imdb.com/title/${ids.imdb_id}` });
        if (ids.facebook_id) meta.links.push({ name: 'Facebook', category: 'Social', url: `https://facebook.com/${ids.facebook_id}` });
        if (ids.instagram_id) meta.links.push({ name: 'Instagram', category: 'Social', url: `https://instagram.com/${ids.instagram_id}` });
        if (ids.twitter_id) meta.links.push({ name: 'Twitter', category: 'Social', url: `https://twitter.com/${ids.twitter_id}` });
    }
    
    // Website ufficiale
    if (tmdbItem.homepage) {
        meta.links.push({ name: 'Sito Ufficiale', category: 'Link', url: tmdbItem.homepage });
    }

    if (meta.links.length === 0) delete meta.links;

    // Logo
    if (tmdbItem.images && tmdbItem.images.logos && tmdbItem.images.logos.length > 0) {
        const itLogo = tmdbItem.images.logos.find(l => l.iso_639_1 === 'it');
        const targetLogo = itLogo || tmdbItem.images.logos[0];
        meta.logo = `https://image.tmdb.org/t/p/w500${targetLogo.file_path}`;
    }

    // Background Blur
    if (meta.background) {
        meta.behaviorHints.backgroundBlur = `https://wsrv.nl/?url=${encodeURIComponent(meta.background)}&blur=20`;
    }

    return meta;
}

/**
 * Recupera un listato dinamico (discover) o una query di ricerca e si preoccupa
 * di parallelizzare le pagine TMDB per riempire lo skip di Stremio.
 * Questa è la funzione interna senza cache.
 *
 * Tutte le pagine restituiscono "Light Mode" (ID, nome, poster, background, descrizione,
 * releaseInfo, imdbRating, genre_ids) per azzerare la latenza.
 * L'arricchimento completo avviene in background per le pagine principali.
 */
async function fetchTmdbCatalogDirect(client, endpoint, startPage = 1, customParams = {}, type = 'movie', pagesToFetch = 1, opts = {}) {
    const promises = [];

    for (let i = 0; i < pagesToFetch; i++) {
        const pageParams = { ...customParams, page: startPage + i };
        promises.push(client.get(endpoint, { params: pageParams }));
    }

    try {
        const results = await Promise.allSettled(promises);
        const items = [];

        // Uniamo e deduplichiamo
        const seenIds = new Set();

        const hotQueue = [];
        const coldQueue = [];
        results.forEach((res, pageIndex) => {
            if (res.status === 'fulfilled' && res.value?.data?.results) {
                for (const item of res.value.data.results) {
                    if (!seenIds.has(item.id)) {
                        seenIds.add(item.id);
                        const queueItem = { item, type };
                        items.push(queueItem);
                        if (pageIndex === 0) {
                            hotQueue.push(queueItem);
                        } else {
                            coldQueue.push(queueItem);
                        }
                    }
                }
            } else if (res.status === 'rejected') {
                console.error(`Errore in una sub-query TMDB (${endpoint}):`, res.reason?.message);
            }
        });

        if (!opts.lightMode && items.length > 0) {
            const apiKey = client.defaults.params.api_key;
            
            if (hotQueue.length > 0) {
                // Fetch hotQueue synchronously to ensure the first page has localized covers!
                await rateLimitedMap(hotQueue, async ({ item, type: t }) => {
                    try {
                        await getTmdbMovieDetails(apiKey, item.id.toString(), t === 'series' ? 'tv' : 'movie');
                    } catch (_e) { }
                }, { batchSize: 5, delayMs: 0 });
            }

            if (coldQueue.length > 0) {
                setImmediate(() => {
                    const enrichQueue = (queue) => rateLimitedMap(queue, async ({ item, type: t }) => {
                        try {
                            await getTmdbMovieDetails(apiKey, item.id.toString(), t === 'series' ? 'tv' : 'movie');
                        } catch (_e) { }
                    }, { batchSize: 1, delayMs: 600 });
                    enrichQueue(coldQueue).catch(() => {});
                });
            }
        }

        const lightMetas = await Promise.all(items.map(async ({ item, type: t }) => {
            let name = item.title || item.name || 'Unknown';
            let poster = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null;
            let background = item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null;
            
            const tmdbId = item.id.toString();
            const tmdbType = t === 'series' ? 'tv' : 'movie';
            const cacheKey = `v2:${tmdbType}:${tmdbId}`;
            
            // Try cache (it will hit immediately for hotQueue since we just fetched it)
            const { value: cachedData } = await tmdbDetailsCache.getWithStatus(cacheKey);

            if (cachedData) {
                if (cachedData.title) name = cachedData.title;
                if (cachedData.name) name = cachedData.name;
                
                let bestPoster = cachedData.poster_path;
                let bestBackdrop = cachedData.backdrop_path;

                if (cachedData.images && Array.isArray(cachedData.images.posters) && cachedData.images.posters.length > 0) {
                    bestPoster = cachedData.images.posters[0].file_path;
                }
                if (cachedData.images && Array.isArray(cachedData.images.backdrops) && cachedData.images.backdrops.length > 0) {
                    bestBackdrop = cachedData.images.backdrops[0].file_path;
                }

                if (bestPoster) poster = `https://image.tmdb.org/t/p/w342${bestPoster}`;
                if (bestBackdrop) background = `https://image.tmdb.org/t/p/w780${bestBackdrop}`;
            }

            return {
                id: `tmdb:${item.id}`,
                type: t === 'series' ? 'series' : 'movie',
                name,
                poster,
                posterShape: 'poster',
                background,
                description: item.overview || '',
                releaseInfo: (item.release_date || item.first_air_date || '').substring(0, 4),
                imdbRating: item.vote_average ? item.vote_average.toFixed(1) : undefined,
                genre_ids: item.genre_ids || [],
                popularity: item.popularity || 0
            };
        }));

        return { items: lightMetas, nextPageFetched: startPage + pagesToFetch };
    } catch (err) {
        console.error(`Errore fetchTmdbCatalog ${endpoint}:`, err.message);
        return { items: [], nextPageFetched: startPage };
    }
}

/**
 * Generates a per-page cache key for isolated page caching.
 * Format: <baseHash>:page:<pageNum>
 */
function getPageCacheKey(endpoint, customParams, type, pageNum) {
    const baseHash = generateRequestHash(endpoint, customParams, 0, type);
    return `${baseHash}:page:${pageNum}`;
}

/**
 * Determines the appropriate L2 TTL for a catalog page based on catalog speed tier.
 */
function getPageCacheTtl(pageNum, options = {}) {
    const tier = options.catalogTier || 'default';
    if (tier === 'fast') {
        return pageNum === 1 ? FAST_CATALOG_PAGE1_L2_TTL_MS : FAST_CATALOG_DEEP_L2_TTL_MS;
    }
    if (tier === 'slow') {
        return SLOW_CATALOG_L2_TTL_MS;
    }
    // default — use provided cacheTtlMs or fallback
    return options.cacheTtlMs || CACHE_TTL_MS;
}

/**
 * Wrapper with per-page cache keys and SWR via CacheManager.
 *
 * Each Stremio "page" (skip / ITEMS_PER_PAGE + 1) gets its own isolated cache key
 * in both RAM (L1) and MongoDB (L2). SWR is handled by CacheManager.getWithStatus().
 *
 * - Cache Hit Fresh: return instantly.
 * - Cache Hit Stale (SWR window): return stale data, revalidate in background.
 * - Cache Miss L1, Hit L2: CacheManager promotes to L1 automatically.
 * - Total Cache Miss: fetch from TMDB.
 *   - Page 1: full enrichment.
 *   - Deep pages (>1) on total miss: Fast-Pass (light mode, no enrichment).
 */
async function fetchTmdbCatalog(client, endpoint, skip, customParams = {}, type = 'movie', options = {}) {
    const normalizedSkip = skip ?? 0;
    const fetchSize = ITEMS_PER_PAGE;
    // Stremio page number (1-based)
    const pageNum = Math.floor(normalizedSkip / fetchSize) + 1;
    const intraPageOffset = normalizedSkip % fetchSize;

    // Se lo skip non è allineato alla pagina, potremmo aver bisogno di 2 pagine TMDB per coprire la richiesta
    const needsTwoPages = intraPageOffset > 0;
    const pagesToFetchForSlice = needsTwoPages ? 2 : 1;

    const cacheKey = getPageCacheKey(endpoint, customParams, type, pageNum);
    const cacheTtl = getPageCacheTtl(pageNum, options);

    try {
        const { value: cached, status } = await TmdbRequestCache.getWithStatus(cacheKey);

        if (cached && status !== 'miss' && !needsTwoPages) {
            const cachedItems = Array.isArray(cached.stremioData) ? cached.stremioData : [];

            // SWR: if stale, trigger background revalidation
            if (status === 'stale') {
                const tmdbStartPage = (pageNum - 1) * (fetchSize / ITEMS_PER_PAGE) + 1;
                fetchTmdbCatalogDirect(client, endpoint, tmdbStartPage, customParams, type, 1)
                    .then(({ items: newItems }) => {
                        if (newItems.length > 0) {
                            TmdbRequestCache.set(cacheKey, { stremioData: newItems }, cacheTtl, options);
                        }
                    })
                    .catch(e => console.error('[SWR Revalidate] Error:', e.message));
            }

            if (cachedItems.length > 0) {
                return cachedItems.slice(0, fetchSize);
            }
        }
    } catch (_e) {
        // Fall through to fresh fetch
    }

    // ─── Cache Miss or Misaligned Skip: fetch from TMDB ───
    const isFirstPage = pageNum === 1 && !needsTwoPages;
    const tmdbStartPage = pageNum;
    const pagesToFetch = isFirstPage ? PAGES_PER_REQUEST : pagesToFetchForSlice;

    const lightMode = !isFirstPage && !options.disableLightMode;

    const { items: results, nextPageFetched } = await fetchTmdbCatalogDirect(
        client, endpoint, tmdbStartPage, customParams, type, pagesToFetch, { lightMode }
    );

    // Save results per-page (only for aligned requests to keep cache clean)
    if (!needsTwoPages) {
        if (isFirstPage && results.length > 0) {
            for (let p = 0; p < PAGES_PER_REQUEST; p++) {
                const pageSlice = results.slice(p * ITEMS_PER_PAGE, (p + 1) * ITEMS_PER_PAGE);
                if (pageSlice.length > 0) {
                    const pageKey = getPageCacheKey(endpoint, customParams, type, p + 1);
                    const pageTtl = getPageCacheTtl(p + 1, options);
                    TmdbRequestCache.set(pageKey, { stremioData: pageSlice }, pageTtl, options)
                        .catch(e => console.error('[Cache Save] Error:', e.message));
                }
            }
        } else if (results.length > 0) {
            TmdbRequestCache.set(cacheKey, { stremioData: results }, cacheTtl, options)
                .catch(e => console.error('[Cache Save] Error:', e.message));
        }
    }

    return results.slice(intraPageOffset, intraPageOffset + fetchSize);
}

/**
 * Recupera le stagioni e gli episodi per una Serie TV da TMDB.
 * Usa append_to_response per raggruppare fino a 20 stagioni per chiamata HTTP,
 * riducendo drasticamente il numero di richieste (es. 30 stagioni → 2 chiamate).
 */
async function fetchTmdbEpisodes(client, tmdbId, totalSeasons, imdbId, originalLanguage = null) {
    const cacheKey = `eps:${tmdbId}`;
    const { value: cached, status } = await tvEpisodesCache.getWithStatus(cacheKey);
    if (status === 'fresh') return cached;

    const fetchAllSeasonEpisodes = async () => {
        const startSeason = 1;
        const maxSeasonsToFetch = Math.min(totalSeasons, 50);
        const APPEND_BATCH_SIZE = 20; // TMDB limit for append_to_response

        const seasonNumbers = [];
        for (let i = startSeason; i <= maxSeasonsToFetch; i++) {
            seasonNumbers.push(i);
        }

        // Group seasons into batches of 20 for append_to_response
        const seasonBatches = [];
        for (let i = 0; i < seasonNumbers.length; i += APPEND_BATCH_SIZE) {
            seasonBatches.push(seasonNumbers.slice(i, i + APPEND_BATCH_SIZE));
        }

        // Fetch all season batches using append_to_response (rate-limited)
        const batchResults = await rateLimitedMap(seasonBatches, async (batch) => {
            try {
                const appendValue = batch.map(n => `season/${n}`).join(',');
                const res = await client.get(`/tv/${tmdbId}`, {
                    params: { append_to_response: appendValue }
                });
                return res.data;
            } catch (e) {
                // console.error(`[Episodes] append_to_response batch failed for tv/${tmdbId}:`, e.message);
                return null;
            }
        }, { batchSize: 2, delayMs: 200 });

        // Extract season data from batch responses
        const seasonDataMap = new Map();
        for (const data of batchResults) {
            if (!data) continue;
            for (const sn of seasonNumbers) {
                const key = `season/${sn}`;
                if (data[key] && data[key].episodes) {
                    seasonDataMap.set(sn, data[key]);
                }
            }
        }



        const buildEpisodesFromSeason = async (seasonData, fallbackMaps = {}) => {
            if (!seasonData?.episodes) return [];
            const enOverviewByEpisode = fallbackMaps.enOverviewByEpisode || new Map();
            const originalOverviewByEpisode = fallbackMaps.originalOverviewByEpisode || new Map();
            
            // Limit mapping to avoid processing huge arrays synchronously if possible
            return rateLimitedMap(seasonData.episodes, async (ep) => {
                let overview = ep.overview || '';
                
                // Use English or original overview as fallback if Italian is missing
                if (!overview.trim()) {
                    overview = enOverviewByEpisode.get(ep.episode_number) || originalOverviewByEpisode.get(ep.episode_number) || '';
                }

                return {
                    id: imdbId ? `${imdbId}:${ep.season_number}:${ep.episode_number}` : `tmdb:${tmdbId}:${ep.season_number}:${ep.episode_number}`,
                    title: ep.name || `Episodio ${ep.episode_number}`,
                    released: ep.air_date ? new Date(ep.air_date).toISOString() : null,
                    season: ep.season_number,
                    episode: ep.episode_number,
                    overview,
                    thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null
                };
            }, { batchSize: 5, delayMs: 40 }); // Increased batch size for faster processing of large lists
        };

        // Process seasons: build episodes with overview fallback where needed
        const allSeasonEntries = Array.from(seasonDataMap.entries());
        const seasonVideoChunks = await rateLimitedMap(allSeasonEntries, async ([seasonNumber, seasonData]) => {
            const hasMissingOverview = seasonData.episodes.some(ep => !ep.overview?.trim());
            if (!hasMissingOverview) {
                return buildEpisodesFromSeason(seasonData);
            }

            const fallbackRequests = [client.get(`/tv/${tmdbId}/season/${seasonNumber}`, { params: { language: 'en-US' } })];
            if (originalLanguage && originalLanguage !== 'it' && originalLanguage !== 'en') {
                fallbackRequests.push(client.get(`/tv/${tmdbId}/season/${seasonNumber}`, { params: { language: originalLanguage } }));
            }

            try {
                const fallbackResults = await Promise.allSettled(fallbackRequests);
                const enOverviewByEpisode = new Map();
                const originalOverviewByEpisode = new Map();

                const enEpisodes = fallbackResults[0]?.status === 'fulfilled' ? fallbackResults[0].value?.data?.episodes : [];
                for (const ep of enEpisodes || []) {
                    if (ep?.overview?.trim()) enOverviewByEpisode.set(ep.episode_number, ep.overview);
                }

                const origEpisodes = fallbackResults[1]?.status === 'fulfilled' ? fallbackResults[1].value?.data?.episodes : [];
                for (const ep of origEpisodes || []) {
                    if (ep?.overview?.trim()) originalOverviewByEpisode.set(ep.episode_number, ep.overview);
                }

                return buildEpisodesFromSeason(seasonData, { enOverviewByEpisode, originalOverviewByEpisode });
            } catch (_e) {
                return buildEpisodesFromSeason(seasonData);
            }
        }, { batchSize: 3, delayMs: 200 });

        const videos = seasonVideoChunks.filter(Boolean).flat();

        if (videos.length > 0) {
            await tvEpisodesCache.set(cacheKey, videos);
        }

        return videos;
    };

    if (status === 'stale') {
        fetchAllSeasonEpisodes().catch(e => console.error('[SWR] Episode revalidation error:', e.message));
        return cached;
    }

    try {
        return await fetchAllSeasonEpisodes();
    } catch (e) {
        console.error("Errore fetchTmdbEpisodes:", e.message);
        return [];
    }
}

/**
 * Ottiene i dettagli completi per il Meta Handler di Stremio
 */
async function getTmdbMetaDetails(apiKey, id, type, externalRatings = {}) {
    const tmdbId = id.replace('tmdb:', '').trim();

    if (!/^\d+$/.test(tmdbId)) {
        console.error(`ID TMDB non valido: ${tmdbId}`);
        return null;
    }

    const cacheKey = `full:v2:${type}:${tmdbId}`;
    const { value: cachedData, status: cacheStatus } = await tmdbDetailsCache.getWithStatus(cacheKey);
    let data = cachedData;

    const client = createTmdbClient(apiKey);
    const endpoint = type === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;

    if (cacheStatus === 'miss') {
        try {
            const res = await client.get(endpoint, {
                params: {
                    append_to_response: 'videos,credits,images,external_ids,release_dates,content_ratings,keywords',
                    include_image_language: 'it,en,null'
                }
            });
            data = res.data;
            if (data) {
                // Trimming: riduce il payload prima di metterlo in cache (anti-OOM / anti-16MB BSON)
                if (data.credits) {
                    if (Array.isArray(data.credits.cast)) {
                        data.credits.cast = data.credits.cast.slice(0, MAX_CAST_SIZE);
                    }
                    if (Array.isArray(data.credits.crew)) {
                        data.credits.crew = data.credits.crew
                            .filter(c => KEY_CREW_ROLES.includes(c.job))
                            .slice(0, MAX_CREW_SIZE);
                    }
                }
                if (data.images) {
                    if (Array.isArray(data.images.logos)) data.images.logos = prioritizeLocalizedImages(data.images.logos);
                    if (Array.isArray(data.images.backdrops)) data.images.backdrops = data.images.backdrops.slice(0, MAX_IMAGES_PER_TYPE);
                    if (Array.isArray(data.images.posters)) data.images.posters = prioritizeLocalizedImages(data.images.posters);
                }
                if (data.videos?.results) {
                    data.videos.results = data.videos.results
                        .filter(v => v.site === 'YouTube' && v.type === 'Trailer')
                        .slice(0, MAX_TRAILERS);
                }
                await tmdbDetailsCache.set(cacheKey, data);
            }
        } catch (err) {
            if (err.response?.status === 404) {
                await tmdbDetailsCache.set(cacheKey, null, 86400000); // Negative cache 24h
            }
            console.error("Errore TMDB Meta Fetch:", err.message);
            return null;
        }
    }

    if (!data) return null;

    // Fallback linguistico: priorità ai metadati reali (IT → EN → lingua originale),
    // con traduzione solo come ultima spiaggia.
    const itTitle = data.title || data.name;
    const originalTitle = data.original_title || data.original_name;
    const isItalianOriginal = data.original_language === 'it';

    // Un titolo ha bisogno di fallback se non è italiano originale e quello "tradotto" è uguale all'originale (spesso TMDB non ha la traduzione)
    const titleNeedsFallback = !isItalianOriginal && itTitle && originalTitle && itTitle === originalTitle;

    // Una overview ha bisogno di fallback se è mancante, troppo breve o contiene placeholder comuni
    const isCleanOverview = (txt) => txt && txt.trim().length > 10 && !txt.includes("Non abbiamo ancora una descrizione in italiano");
    const overviewNeedsFallback = !isCleanOverview(data.overview);

    if (titleNeedsFallback || overviewNeedsFallback) {
        try {
            const [enRes, origRes] = await Promise.all([
                client.get(endpoint, {
                    params: {
                        language: 'en-US',
                        append_to_response: 'images',
                        include_image_language: 'it,en,null'
                    }
                }).catch(() => null),
                (data.original_language && data.original_language !== 'it' && data.original_language !== 'en')
                    ? client.get(endpoint, {
                        params: {
                            language: data.original_language,
                            append_to_response: 'images',
                            include_image_language: 'it,en,null'
                        }
                    }).catch(() => null)
                    : Promise.resolve(null)
            ]);

            const enData = enRes?.data;
            const origData = origRes?.data;
            if (enData) {
                if (titleNeedsFallback) {
                    const enTitle = enData.title || enData.name;
                    if (enTitle && enTitle !== originalTitle) {
                        if (data.title !== undefined) data.title = enTitle;
                        if (data.name !== undefined) data.name = enTitle;
                    }
                }
            }

            if (overviewNeedsFallback) {
                const enOverview = enData?.overview || '';
                const originalOverview = origData?.overview || '';

                if (isCleanOverview(enOverview)) {
                    data.overview = enOverview;
                } else if (isCleanOverview(originalOverview)) {
                    data.overview = originalOverview;
                } else if (enOverview) {
                    try {
                        data.overview = await translateTextToItalian(enOverview, 'en');
                    } catch (_e) {
                        data.overview = enOverview;
                    }
                } else if (originalOverview) {
                    data.overview = originalOverview;
                }
            }

            // Alcune risposte localizzate possono non includere poster_path pur avendo immagini disponibili.
            if (!data.poster_path) {
                data.poster_path = enData?.poster_path || origData?.poster_path || null;
            }

            if (!data.images?.posters?.length) {
                const postersFromFallback = enData?.images?.posters || origData?.images?.posters || [];
                if (postersFromFallback.length > 0) {
                    data.images = data.images || {};
                    data.images.posters = postersFromFallback;
                }
            }
        } catch (_e) { /* fallback silenzioso */ }
    }

    // Estrazione Certificazione Età (Age Rating)
    let certification = null;
    try {
        if (type === 'movie' && data.release_dates?.results) {
            const releaseData = data.release_dates.results.find(r => r.iso_3166_1 === 'US') || data.release_dates.results[0];
            certification = releaseData?.release_dates?.[0]?.certification;
        } else if (type === 'series' && data.content_ratings?.results) {
            const ratingData = data.content_ratings.results.find(r => r.iso_3166_1 === 'US') || data.content_ratings.results[0];
            certification = ratingData?.rating;
        }
    } catch (_e) { /* ignore */ }
    data.certification = certification;

    const meta = toStremioMetaItem(data, type);
    if (!meta) return null;

    // Se abbiamo il voto IMDb reale (da externalRatings), usiamolo per il campo nativo
    if (externalRatings.imdb) {
        meta.imdbRating = externalRatings.imdb.toString();
    }

    // Costruiamo la descrizione ricca (Technical Card)
    meta.description = formatRichDescription(data, type, externalRatings);

    // Aggiungiamo metadati avanzati nativi (per compatibilità con vari client)
    if (data.credits && data.credits.cast) {
        meta.cast = data.credits.cast.slice(0, MAX_CAST_SIZE).map(c => c.name);
    }
    if (data.genres) {
        meta.genres = data.genres.map(g => g.name);
    }

    meta.runtime = metaRuntime(data, type);

    // Sito ufficiale
    if (data.homepage) {
        meta.website = data.homepage;
    }

    // Registi / Sceneggiatori / Creatori (Nativi)
    if (type === 'movie' && data.credits?.crew) {
        const directors = data.credits.crew.filter(c => c.job === 'Director').map(d => d.name);
        const writers = data.credits.crew.filter(c => ['Writer', 'Screenplay', 'Author'].includes(c.job)).map(w => w.name);
        if (directors.length > 0) meta.director = directors;
        if (writers.length > 0) meta.writer = writers;
    } else if (type === 'series' && data.created_by?.length > 0) {
        meta.director = data.created_by.map(c => c.name);
    }

    // Attach full (unsliced) keyword names for downstream detection (e.g. anime check in metaHandler)
    const rawKwList = type === 'movie' ? data.keywords?.keywords : data.keywords?.results;
    if (rawKwList && rawKwList.length > 0) {
        meta._keywordNames = rawKwList.map(k => k.name.toLowerCase());
    }

    // Early anime detection: skip expensive TMDB episode fetching for anime series
    const isAnimation = data.genres && data.genres.some(g => g.id === 16);
    const hasAnimeKeyword = rawKwList && rawKwList.some(k => k.name.toLowerCase().includes('anime'));
    const isAnime = isAnimation && hasAnimeKeyword;
    meta._isAnime = isAnime;

    // Store necessary properties for fallback TMDB episode fetching if Kitsu mapping fails
    if (isAnime && type === 'series') {
        meta._numberOfSeasons = data.number_of_seasons;
        meta._originalLanguage = data.original_language;
    }

    // Se è una serie TV, scarica gli episodi per popolare la griglia in Stremio
    // Skip episode fetching for anime — metaHandler will use Kitsu episodes instead
    if (type === 'series' && data.number_of_seasons && !isAnime) {
        meta.videos = await fetchTmdbEpisodes(
            client,
            tmdbId,
            data.number_of_seasons,
            meta.id.startsWith('tt') ? meta.id : null,
            data.original_language || null
        );
    }


    return meta;
}

const tmdbDetailsCache = new CacheManager('tmdb_details_raw', { ramMax: 500, ramTtlMs: 24 * 60 * 60 * 1000, mongoTtlMs: MOVIE_DETAILS_TTL_MS });

/**
 * Ottiene i dettagli grezzi di un contenuto TMDB (inclusi credits e keywords)
 * per l'elaborazione del profilo di gusto.
 */
async function getTmdbMovieDetails(apiKey, id, type = 'movie', options = {}) {
    const cacheOnly = typeof options === 'boolean' ? options : Boolean(options?.cacheOnly);
    const tmdbId = id.toString().replace('tmdb:', '').trim();
    if (!/^\d+$/.test(tmdbId)) return null;

    const cacheKey = `v2:${type}:${tmdbId}`;
    const { value: cached, status: cacheStatus } = await tmdbDetailsCache.getWithStatus(cacheKey);
    if (cacheStatus !== 'miss') return cached;
    if (cacheOnly) return null;

    const client = createTmdbClient(apiKey);
    const endpoint = type === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;

    try {
        const res = await client.get(endpoint, {
            params: { 
                append_to_response: 'credits,keywords,images',
                include_image_language: 'it,en,null'
            }
        });

        const data = res.data;
        if (data) {
            // Trimming: riduce il payload prima di metterlo in cache (anti-OOM / anti-16MB BSON)
            if (data.credits) {
                if (Array.isArray(data.credits.cast)) {
                    data.credits.cast = data.credits.cast.slice(0, MAX_CAST_SIZE);
                }
                if (Array.isArray(data.credits.crew)) {
                    data.credits.crew = data.credits.crew
                        .filter(c => KEY_CREW_ROLES.includes(c.job))
                        .slice(0, MAX_CREW_SIZE);
                }
            }
            if (data.images) {
                if (Array.isArray(data.images.logos)) data.images.logos = prioritizeLocalizedImages(data.images.logos);
                if (Array.isArray(data.images.backdrops)) data.images.backdrops = data.images.backdrops.slice(0, MAX_IMAGES_PER_TYPE);
                if (Array.isArray(data.images.posters)) data.images.posters = prioritizeLocalizedImages(data.images.posters);
            }
            // keywords lasciate intatte (fondamentali per l'algoritmo di raccomandazione)

            // Calcola TTL dinamico per Serie TV
            let ttl = MOVIE_DETAILS_TTL_MS;
            if (type === 'tv') {
                const status = data.status; // Returning Series, Ended, Canceled, etc.
                const isFinished = status === 'Ended' || status === 'Canceled';
                ttl = isFinished ? SERIES_FINISHED_TTL_MS : SERIES_ONGOING_TTL_MS;
            }

            await tmdbDetailsCache.set(cacheKey, data, ttl);
        }
        return data;
    } catch (err) {
        if (err.response?.status === 404) {
            await tmdbDetailsCache.set(cacheKey, null, 86400000); // Negative cache 24h
        }
        console.error(`Errore getTmdbMovieDetails (${type} - ${tmdbId}):`, err.message);
        return null;
    }
}

/**
 * Svuota tutte le cache in memoria del modulo TMDB (idName, imdbId, movieMeta, seriesMeta, details).
 */
async function clearAllTmdbCaches() {
    await Promise.all([
        idNameCache.clear(),
        imdbIdCache.clear(),
        movieMetaCache.clear(),
        seriesMetaCache.clear(),
        tmdbDetailsCache.clear()
    ]);
}

module.exports = {
    createTmdbClient, // Esportato in caso serva passare chiavi specifiche
    fetchTmdbCatalog,
    getTmdbMetaDetails,
    getTmdbMovieDetails,
    getTmdbIdByName,
    resolveImdbId,
    formatRichDescription,
    fetchTmdbEpisodes,
    prioritizeLocalizedImages
};
