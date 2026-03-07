const { createAxiosInstance } = require('../utils/httpClient');
const {
    TMDB_ENDPOINT,
    DEFAULT_LANGUAGE,
    DEFAULT_REGION,
    PAGES_PER_REQUEST,
    ITEMS_PER_PAGE,
    SERIES_META_CACHE_TTL_MS,
    MOVIE_META_CACHE_TTL_MS,
    MOVIE_DETAILS_TTL_MS,
    SERIES_FINISHED_TTL_MS,
    SERIES_ONGOING_TTL_MS,
    CACHE_TTL_MS
} = require('../config');
const { rateLimitedMapFiltered } = require('../utils/rateLimiter');
const { isMovieReleasedDigitally } = require('../utils/releaseFilter');
const { generateRequestHash } = require('../utils/requestHash');
const TmdbRequestCache = require('../models/TmdbRequestCache');

const CacheManager = require('../cache/CacheManager');

const lingvaClient = createAxiosInstance('https://lingva.ml');

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
            console.warn(`TMDB mirror ${TMDB_MIRRORS[currentMirrorIdx]} failed, switching...`);
            currentMirrorIdx = (currentMirrorIdx + 1) % TMDB_MIRRORS.length;
            err.config.baseURL = TMDB_MIRRORS[currentMirrorIdx];
            err.config.url = err.config.url.replace(/^(https?:\/\/[^\/]+)/, TMDB_MIRRORS[currentMirrorIdx]);
            return client.request(err.config);
        }
        return Promise.reject(err);
    });

    return client;
};

const idNameCache = new CacheManager('tmdb_id_name', { ramMax: 50, ramTtlMs: 1000 * 60 * 60, mongoTtlMs: 1000 * 60 * 60 });
const imdbIdCache = new CacheManager('tmdb_imdb_id', { ramMax: 50, ramTtlMs: 1000 * 60 * 60 * 24 * 7, mongoTtlMs: 1000 * 60 * 60 * 24 * 7 });
const movieMetaCache = new CacheManager('tmdb_movie_meta', { ramMax: 50, ramTtlMs: MOVIE_META_CACHE_TTL_MS, mongoTtlMs: MOVIE_META_CACHE_TTL_MS });
const seriesMetaCache = new CacheManager('tmdb_series_meta', { ramMax: 50, ramTtlMs: SERIES_META_CACHE_TTL_MS, mongoTtlMs: SERIES_META_CACHE_TTL_MS });
const tvEpisodesCache = new CacheManager('tmdb_episodes', { ramMax: 50, ramTtlMs: SERIES_META_CACHE_TTL_MS, mongoTtlMs: SERIES_META_CACHE_TTL_MS });

/**
 * Traduce una stringa (es. nome attore o keyword) nel suo ID TMDB effettuando una fetch al volo
 */
async function getTmdbIdByName(apiKey, endpoint, query) {
    if (!query) return null;
    const cacheKey = `${endpoint}:${query.toLowerCase()}`;
    const cached = await idNameCache.get(cacheKey);
    if (cached) return cached;

    try {
        const client = createTmdbClient(apiKey);
        const res = await client.get(`/search/${endpoint}`, { params: { query } });
        const id = res.data?.results?.[0]?.id || null;
        if (id) await idNameCache.set(cacheKey, id);
        return id;
    } catch (e) {
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
    const cached = await imdbIdCache.get(cacheKey);
    if (cached) return cached;

    try {
        const client = createTmdbClient(apiKey);
        const searchType = type === 'movie' ? 'movie' : 'tv';
        const res = await client.get(`/${searchType}/${tmdbId}/external_ids`);
        const imdbId = res.data?.imdb_id || null;
        if (imdbId) await imdbIdCache.set(cacheKey, imdbId);
        return imdbId;
    } catch (_e) {
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
    const lines = [];
    const separator = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

    // 1. Banner dei Voti
    const scoreParts = [];
    if (data.vote_average) scoreParts.push(`⭐ ${parseFloat(data.vote_average).toFixed(1)} TMDB`);
    if (ratings.imdb) scoreParts.push(`🆔 IMDb ${ratings.imdb}`);
    if (ratings.rtCritic) scoreParts.push(`🍅 ${ratings.rtCritic}%`);
    if (ratings.rtAudience) scoreParts.push(`🍿 ${ratings.rtAudience}%`);
    if (ratings.metacritic) scoreParts.push(`Ⓜ️ ${ratings.metacritic}/100`);

    if (scoreParts.length > 0) {
        lines.push(separator);
        lines.push(scoreParts.join(' | '));
        lines.push(separator);
        lines.push('');
    }

    // 2. Tagline
    if (data.tagline) {
        lines.push(`"${data.tagline}"`);
        lines.push('');
    }

    // 3. Trama
    if (data.overview) {
        lines.push('📜 TRAMA');
        lines.push(data.overview);
        lines.push('');
        lines.push('');
    }

    // 4. Info Tecniche
    lines.push('ℹ️ INFO TECNICHE');
    const technicalInfo = [];

    // Status e Next Episode per serie
    if (type === 'series' && data.status) {
        const isEnded = ['Ended', 'Canceled'].includes(data.status);
        const statusEmoji = isEnded ? '🔴' : '🟢';
        let statusLine = `${statusEmoji} Status: ${data.status}`;
        if (!isEnded && data.next_episode_to_air?.air_date) {
            const nextDate = new Date(data.next_episode_to_air.air_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
            statusLine += ` (Prossimo: ${nextDate})`;
        }
        technicalInfo.push(statusLine);
    }

    // Network / Studio
    if (type === 'series' && data.networks?.length > 0) {
        technicalInfo.push(`📺 Network: ${data.networks.map(n => n.name).join(', ')}`);
    } else if (type === 'movie' && data.production_companies?.length > 0) {
        technicalInfo.push(`🏢 Studio: ${data.production_companies.slice(0, 2).map(c => c.name).join(', ')}`);
    }

    // Origine e Lingua
    if (data.production_countries?.length > 0) {
        const country = data.production_countries[0];
        const flag = getCountryEmoji(country.iso_3166_1);
        technicalInfo.push(`🌍 Origine: ${country.name} ${flag}`);
    }

    // Rating e Runtime
    let runtime = metaRuntime(data, type);
    let certification = data.certification;
    const certPart = certification ? `[${certification}]` : '';
    const runtimePart = runtime ? `⏳ ${runtime}` : '';
    if (certPart || runtimePart) {
        technicalInfo.push(`🔞 Rating: ${certPart} ${runtimePart}`.trim().replace('  ', ' · '));
    }

    if (technicalInfo.length > 0) {
        lines.push(technicalInfo.join('\n'));
        lines.push('');
        lines.push('');
    }

    // 5. Saga e Dati Finanziari (solo film)
    if (type === 'movie' && (data.belongs_to_collection || data.budget)) {
        const curiosities = [];
        if (data.belongs_to_collection) curiosities.push(`🎬 Saga: ${data.belongs_to_collection.name}`);
        if (data.budget) {
            const budget = data.budget > 0 ? `$${(data.budget / 1000000).toFixed(0)}M` : 'N/A';
            const revenue = data.revenue > 0 ? `$${(data.revenue / 1000000).toFixed(0)}M` : 'N/A';
            curiosities.push(`💰 Budget: ${budget} · Incasso: ${revenue}`);
        }
        if (curiosities.length > 0) {
            lines.push('💎 DETTAGLI');
            lines.push(curiosities.join('\n'));
            lines.push('');
            lines.push('');
        }
    }

    // 6. Tags (Hashtags)
    if (data.keywords?.keywords?.length > 0 || data.keywords?.results?.length > 0) {
        const kwList = type === 'movie' ? data.keywords.keywords : data.keywords.results;
        const tags = kwList.slice(0, 8).map(k => `#${k.name.replace(/\s+/g, '')}`);
        if (tags.length > 0) {
            lines.push('🔗 TAGS');
            lines.push(tags.join(' '));
            lines.push('');
            lines.push('');
        }
    }

    lines.push(separator);

    return lines.join('\n').trim();
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
    const prefixedName = isTheatrical ? `🏷️ AL CINEMA ${name}` : name;
    const posterPath = pickPosterPath(tmdbItem);

    const meta = {
        id,
        imdb_id: imdbId, // Native flag for badges
        type: type === 'movie' ? 'movie' : 'series',
        name: prefixedName,
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

    // Network
    if (type === 'series' && tmdbItem.networks) {
        for (const n of tmdbItem.networks) {
            meta.links.push({ name: n.name, category: 'Network', url: `stremio:///search?search=${encodeURIComponent(n.name)}` });
        }
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
 */
async function fetchTmdbCatalogDirect(client, endpoint, startPage = 1, customParams = {}, type = 'movie', pagesToFetch = 1) {
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

        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value?.data?.results) {
                for (const item of res.value.data.results) {
                    if (!seenIds.has(item.id)) {
                        seenIds.add(item.id);
                        items.push({ item, type });
                    }
                }
            } else if (res.status === 'rejected') {
                console.error(`Errore in una sub-query TMDB (${endpoint}):`, res.reason?.message);
            }
        });

        // Applichiamo filtro di rilascio e arricchiamo con metadati IMDB
        const apiKey = client.defaults.params.api_key;

        const filteredMetas = await rateLimitedMapFiltered(items, async ({ item, type }) => {
            if (type === 'movie' && (!customParams.with_original_language || customParams.with_original_language !== 'ko')) {
                const isReleased = await isMovieReleasedDigitally(item.id, apiKey);
                if (!isReleased) return null;
            }
            const meta = await getTmdbMetaDetails(apiKey, `tmdb:${item.id}`, type);
            // Fase 2: alleggerimento episodi per il catalogo (griglia).
            // Conserva solo l'episodio trasmesso più recente; la cache episodi completa
            // viene usata dalla rotta /meta/... tramite fetchTmdbEpisodes (invariata).
            if (meta && Array.isArray(meta.videos)) {
                const now = new Date();
                const aired = meta.videos
                    .filter(v => v.released && new Date(v.released) <= now)
                    .sort((a, b) => new Date(b.released) - new Date(a.released));
                if (aired.length > 0) {
                    meta.videos = [aired[0]];
                } else {
                    delete meta.videos;
                }
            }
            return meta;
        }, { batchSize: 10, delayMs: 200 });

        return { items: filteredMetas, nextPageFetched: startPage + pagesToFetch };
    } catch (err) {
        console.error(`Errore fetchTmdbCatalog ${endpoint}:`, err.message);
        return { items: [], nextPageFetched: startPage };
    }
}

function mergeCatalogItems(existingItems = [], newItems = []) {
    const merged = [];
    const seenIds = new Set();

    for (const item of [...existingItems, ...newItems]) {
        if (!item || !item.id || seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        merged.push(item);
    }

    return merged;
}

/**
 * Helper: saves data to TmdbRequestCache, preserving the original updatedAt timestamp
 * when appending new pages (nextPage > 1) to avoid resetting the staleness clock.
 */
async function saveTmdbCatalogCache(requestHash, stremioData, nextPage, options = {}) {
    let updatedAt = Date.now();

    if (nextPage > 1 || nextPage === -1) {
        const existing = await TmdbRequestCache.get(requestHash);
        if (existing) {
            if (nextPage === -1) nextPage = existing.nextPage;
            updatedAt = existing.updatedAt || updatedAt;
        }
    }

    await TmdbRequestCache.set(requestHash, { stremioData, nextPage, updatedAt }, null, options);
}

/**
 * Wrapper con cache globale basata sulle richieste TMDB.
 * Implementa il pattern Stale-While-Revalidate:
 * - Cache Miss: chiama TMDB, salva in cache, ritorna.
 * - Cache Hit Fresca (<TTL): ritorna i dati dalla cache all'istante.
 * - Cache Hit Scaduta (>TTL): ritorna i dati vecchi, rinnova in background.
 */
async function fetchTmdbCatalog(client, endpoint, skip, customParams = {}, type = 'movie', options = {}) {
    const normalizedSkip = skip ?? 0;
    const requestHash = generateRequestHash(endpoint, customParams, 0, type); // Hash always based on offset 0 to share cache
    const cacheTtlMs = options.cacheTtlMs || CACHE_TTL_MS;
    const fetchSize = ITEMS_PER_PAGE; // Always return 20 items to Stremio
    const sliceEnd = normalizedSkip + fetchSize;

    try {
        const rawCached = await TmdbRequestCache.get(requestHash);

        if (rawCached) {
            const cachedItems = Array.isArray(rawCached.stremioData) ? rawCached.stremioData : [];
            const age = Date.now() - (rawCached.updatedAt || 0);
            const isStale = age > cacheTtlMs;

            const cachedSlice = cachedItems.slice(normalizedSkip, sliceEnd);

            // AGGRESSIVE SWR: Return cached data immediately if we have it
            const hasEnoughItems = cachedItems.length >= sliceEnd || cachedItems.length === rawCached.total_results || rawCached.nextPage === -1;

            // Detect when cache exists but has nothing for the requested skip range
            // and we know the next TMDB page to fetch.
            const needsSyncExtension = !hasEnoughItems && cachedSlice.length === 0
                && cachedItems.length > 0 && rawCached.nextPage > 0;

            if ((isStale || !hasEnoughItems) && !needsSyncExtension) {
                // Background SWR: only when we can return data immediately
                const startPage = !hasEnoughItems ? rawCached.nextPage : 1;
                const pagesToFetch = !hasEnoughItems ? 1 : PAGES_PER_REQUEST;

                if (startPage > 0) {
                    fetchTmdbCatalogDirect(client, endpoint, startPage, customParams, type, pagesToFetch)
                        .then(({ items: newItems, nextPageFetched }) => {
                            const updatedItems = startPage === 1 ? newItems : mergeCatalogItems(cachedItems, newItems);
                            saveTmdbCatalogCache(requestHash, updatedItems, nextPageFetched, options);
                        })
                        .catch(e => console.error('[SWR Revalidate] Error:', e.message));
                }
            }

            // Return from cache (only the requested slice!)
            if (cachedSlice.length > 0) {
                return cachedSlice;
            }

            // Synchronous extension: cache exists but doesn't cover the requested
            // skip range — fetch the next page, merge into cache, and return the slice.
            if (needsSyncExtension) {
                const { items: newItems, nextPageFetched } = await fetchTmdbCatalogDirect(
                    client, endpoint, rawCached.nextPage, customParams, type, 1
                );
                const updatedItems = mergeCatalogItems(cachedItems, newItems);
                await saveTmdbCatalogCache(requestHash, updatedItems, nextPageFetched, options);
                return updatedItems.slice(normalizedSkip, sliceEnd);
            }

            // Catalog exhausted
            if (hasEnoughItems) {
                return [];
            }
        }
    } catch (_e) {
        // Fall through
    }

    // Scenario A: Cache Miss or skipped range
    // Calculate which page we need if skip > 0
    const startPage = Math.floor(normalizedSkip / ITEMS_PER_PAGE) + 1;
    const pagesToFetch = (normalizedSkip === 0) ? PAGES_PER_REQUEST : 1;

    const { items: results, nextPageFetched } = await fetchTmdbCatalogDirect(client, endpoint, startPage, customParams, type, pagesToFetch);

    // Save to cache if we started from 0 (standard case) or if we want to build a partial cache
    if (normalizedSkip === 0) {
        await saveTmdbCatalogCache(requestHash, results, nextPageFetched, options);
        return results.slice(0, fetchSize); // Return only 20
    }

    // If skip > 0 and no cache, we return only the fetched page results
    // properly sliced if skip wasn't a perfect multiple of 20 (though it usually is)
    const localSliceStart = normalizedSkip % ITEMS_PER_PAGE;
    return results.slice(localSliceStart, localSliceStart + fetchSize);
}

/**
 * Recupera le stagioni e gli episodi per una Serie TV da TMDB
 */
async function fetchTmdbEpisodes(client, tmdbId, totalSeasons, imdbId, originalLanguage = null) {
    const cacheKey = `eps:${tmdbId}`;
    const cached = await tvEpisodesCache.get(cacheKey);
    if (cached) return cached;

    try {
        const promises = [];
        // TMDB Seasons are 1-indexed. Sometimes there is Season 0 (Specials).
        // Fetch all seasons, with a reasonable safety limit (e.g., 50)
        const startSeason = 1;
        const maxSeasonsToFetch = Math.min(totalSeasons, 50);

        for (let i = startSeason; i <= maxSeasonsToFetch; i++) {
            promises.push(client.get(`/tv/${tmdbId}/season/${i}`));
        }

        const results = await Promise.allSettled(promises);

        const buildEpisodesFromSeason = (seasonData, fallbackMaps = {}) => {
            if (!seasonData?.episodes) return [];
            const enOverviewByEpisode = fallbackMaps.enOverviewByEpisode || new Map();
            const originalOverviewByEpisode = fallbackMaps.originalOverviewByEpisode || new Map();
            return seasonData.episodes.map(ep => {
                const fallbackOverview = enOverviewByEpisode.get(ep.episode_number) || originalOverviewByEpisode.get(ep.episode_number) || '';
                return {
                    id: imdbId ? `${imdbId}:${ep.season_number}:${ep.episode_number}` : `tmdb:${tmdbId}:${ep.season_number}:${ep.episode_number}`,
                    title: ep.name || `Episodio ${ep.episode_number}`,
                    released: ep.air_date ? new Date(ep.air_date).toISOString() : null,
                    season: ep.season_number,
                    episode: ep.episode_number,
                    overview: ep.overview || fallbackOverview,
                    thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null
                };
            });
        };

        const seasonVideoChunks = await Promise.all(results.map(async (res) => {
            if (res.status === 'fulfilled' && res.value?.data?.episodes) {
                const seasonData = res.value.data;
                const hasMissingOverview = seasonData.episodes.some(ep => !ep.overview?.trim());
                if (!hasMissingOverview) {
                    return buildEpisodesFromSeason(seasonData);
                }

                const seasonNumber = seasonData.season_number;
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
            }
            return [];
        }));
        const videos = seasonVideoChunks.flat();

        if (videos.length > 0) {
            await tvEpisodesCache.set(cacheKey, videos);
        }

        return videos;
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

    const cacheKey = `full:${type}:${tmdbId}`;
    const cachedData = await tmdbDetailsCache.get(cacheKey);
    let data = cachedData;

    const client = createTmdbClient(apiKey);
    const endpoint = type === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;

    if (!data) {
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
                    if (Array.isArray(data.images.logos)) data.images.logos = data.images.logos.slice(0, MAX_IMAGES_PER_TYPE);
                    if (Array.isArray(data.images.backdrops)) data.images.backdrops = data.images.backdrops.slice(0, MAX_IMAGES_PER_TYPE);
                    if (Array.isArray(data.images.posters)) data.images.posters = data.images.posters.slice(0, MAX_IMAGES_PER_TYPE);
                }
                if (data.videos?.results) {
                    data.videos.results = data.videos.results
                        .filter(v => v.site === 'YouTube' && v.type === 'Trailer')
                        .slice(0, MAX_TRAILERS);
                }
                await tmdbDetailsCache.set(cacheKey, data);
            }
        } catch (err) {
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
                        const transRes = await lingvaClient.get(`/api/v1/en/it/${encodeURIComponent(enOverview)}`, { timeout: 4000 });
                        if (transRes.data?.translation) {
                            data.overview = transRes.data.translation;
                        } else {
                            data.overview = enOverview;
                        }
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

    // Se abbiamo il voto IMDb reale (da MDBList/externalRatings), usiamolo per il campo nativo
    if (externalRatings.imdb) {
        meta.imdbRating = externalRatings.imdb.toString();
    }

    // Costruiamo la descrizione ricca (Technical Card)
    meta.description = formatRichDescription(data, type, externalRatings);

    // Aggiungiamo metadati avanzati nativi (per compatibilità con vari client)
    if (data.credits && data.credits.cast) {
        meta.cast = data.credits.cast.slice(0, 15).map(c => c.name);
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

    // Se è una serie TV, scarica gli episodi per popolare la griglia in Stremio
    if (type === 'series' && data.number_of_seasons) {
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

const tmdbDetailsCache = new CacheManager('tmdb_details_raw', { ramMax: 50, ramTtlMs: 24 * 60 * 60 * 1000, mongoTtlMs: MOVIE_DETAILS_TTL_MS });

/**
 * Ottiene i dettagli grezzi di un contenuto TMDB (inclusi credits e keywords)
 * per l'elaborazione del profilo di gusto.
 */
async function getTmdbMovieDetails(apiKey, id, type = 'movie') {
    const tmdbId = id.toString().replace('tmdb:', '').trim();
    if (!/^\d+$/.test(tmdbId)) return null;

    const cacheKey = `${type}:${tmdbId}`;
    const cached = await tmdbDetailsCache.get(cacheKey);
    if (cached) return cached;

    const client = createTmdbClient(apiKey);
    const endpoint = type === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;

    try {
        const res = await client.get(endpoint, {
            params: { append_to_response: 'credits,keywords' }
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
    clearAllTmdbCaches
};
