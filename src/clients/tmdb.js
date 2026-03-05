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
    SERIES_ONGOING_TTL_MS
} = require('../config');
// Rate limiting removed per user request
const { isMovieReleasedDigitally } = require('../utils/releaseFilter');
const { generateRequestHash } = require('../utils/requestHash');
const TmdbRequestCache = require('../models/TmdbRequestCache');

const CacheManager = require('../cache/CacheManager');

// Helper interno per costruire oggetti request TMDB
const createTmdbClient = (apiKey) => createAxiosInstance(TMDB_ENDPOINT, {
    baseURL: TMDB_ENDPOINT,
    params: {
        api_key: apiKey,
        language: DEFAULT_LANGUAGE,
        region: DEFAULT_REGION
    },
    timeout: 20000
});

const idNameCache = new CacheManager('tmdb_id_name', { ramMax: 1000, ramTtlMs: 1000 * 60 * 60, mongoTtlMs: 1000 * 60 * 60 });
const imdbIdCache = new CacheManager('tmdb_imdb_id', { ramMax: 10000, ramTtlMs: 1000 * 60 * 60 * 24 * 7, mongoTtlMs: 1000 * 60 * 60 * 24 * 7 });
const movieMetaCache = new CacheManager('tmdb_movie_meta', { ramMax: 2000, ramTtlMs: MOVIE_META_CACHE_TTL_MS, mongoTtlMs: MOVIE_META_CACHE_TTL_MS });
const seriesMetaCache = new CacheManager('tmdb_series_meta', { ramMax: 2000, ramTtlMs: SERIES_META_CACHE_TTL_MS, mongoTtlMs: SERIES_META_CACHE_TTL_MS });

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
 * Trasforma il risultato raw di TMDB nel formato Stremio Meta Preview.
 */
function toStremioMetaItem(tmdbItem, type) {
    if (!tmdbItem) return null;

    // Se abbiamo l'IMDB ID (grazie a external_ids) lo esponiamo, altrimenti fallback a tmdb:
    const id = (tmdbItem.external_ids && tmdbItem.external_ids.imdb_id) ? tmdbItem.external_ids.imdb_id : `tmdb:${tmdbItem.id}`;
    const year = tmdbItem.release_date ? tmdbItem.release_date.split('-')[0] : (tmdbItem.first_air_date ? tmdbItem.first_air_date.split('-')[0] : '');

    return {
        id,
        type: type === 'movie' ? 'movie' : 'series',
        name: tmdbItem.title || tmdbItem.name || 'Titolo sconosciuto',
        poster: tmdbItem.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}` : null,
        background: tmdbItem.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbItem.backdrop_path}` : null,
        posterShape: 'poster',
        description: tmdbItem.overview,
        releaseInfo: year,
        imdbRating: tmdbItem.vote_average ? parseFloat(tmdbItem.vote_average).toFixed(1) : null,
        genre_ids: tmdbItem.genre_ids || (tmdbItem.genres ? tmdbItem.genres.map(g => g.id) : []),
        keywords: tmdbItem.keywords || null,
        behaviorHints: type === 'movie'
            ? { defaultVideoId: id }
            : { hasScheduledVideos: true }
    };
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

        const filteredMetas = (await Promise.all(items.map(async ({ item, type }) => {
            if (type === 'movie' && (!customParams.with_original_language || customParams.with_original_language !== 'ko')) {
                const isReleased = await isMovieReleasedDigitally(item.id, apiKey);
                if (!isReleased) return null;
            }
            return await getTmdbMetaDetails(apiKey, `tmdb:${item.id}`, type);
        }))).filter(Boolean);

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
 * Wrapper con cache globale basata sulle richieste TMDB.
 * Implementa il pattern Stale-While-Revalidate:
 * - Cache Miss: chiama TMDB, salva in cache, ritorna.
 * - Cache Hit Fresca (<TTL): ritorna i dati dalla cache all'istante.
 * - Cache Hit Scaduta (>TTL): ritorna i dati vecchi, rinnova in background.
 */
async function fetchTmdbCatalog(client, endpoint, skip, customParams = {}, type = 'movie', options = {}) {
    const normalizedSkip = skip ?? 0;
    const requestHash = generateRequestHash(endpoint, customParams, 0, type);
    const sliceEnd = normalizedSkip + ITEMS_PER_PAGE;
    const cacheTtlMs = options.cacheTtlMs;

    try {
        const cached = await TmdbRequestCache.get(requestHash, cacheTtlMs);

        if (cached) {
            const cachedItems = Array.isArray(cached.stremioData) ? cached.stremioData : [];
            // Slice items for the given skip. We slice MORE items than ITEMS_PER_PAGE to support `hideWatched` pagination loops.
            const fetchSize = (normalizedSkip === 0) ? (PAGES_PER_REQUEST * ITEMS_PER_PAGE) : ITEMS_PER_PAGE;
            const sliceEnd = normalizedSkip + fetchSize;
            const cachedSlice = cachedItems.slice(normalizedSkip, sliceEnd);

            if (!cached.isStale) {
                // Scenario B: Cache Hit Fresca — latenza minima
                if (normalizedSkip === 0) {
                    return cachedItems;
                }
                // Check if we have enough items in cache for the requested slice
                if (cachedItems.length >= sliceEnd || cachedItems.length === cached.total_results) {
                    // console.log(`[TMDB Cache] Hit Fresca. Returning ${cachedSlice.length} items (skip: ${normalizedSkip}, end: ${sliceEnd})`);
                    return cachedSlice;
                }
                // If not enough items, fallback to fetching
            }

            if (cached.isStale && (cachedItems.length >= sliceEnd || cachedItems.length === cached.total_results)) {
                // Scenario C: Cache Hit Scaduta — Stale-While-Revalidate
                // Rinnova in background a partire dalla pagina 1 (o dalla pagina 1 a X, a seconda di how many pages to fetch)
                // Qui assumiamo che rinnoviamo la prima richiesta massiva (PAGES_PER_REQUEST pagine)
                fetchTmdbCatalogDirect(client, endpoint, 1, customParams, type, PAGES_PER_REQUEST)
                    .then(({ items: results, nextPageFetched }) => { TmdbRequestCache.set(requestHash, endpoint, mergeCatalogItems(cachedItems, results), nextPageFetched); })
                    .catch(e => console.error('Errore rinnovo cache in background:', e.message));

                return normalizedSkip === 0 ? cachedItems : cachedSlice;
            }

            // Scenario D: cache incompleta per lo skip richiesto.
            // Recuperiamo solo la nuova pagina (a partire dal nextPage salvato in cache) e aggiorniamo la lista.
            const { items: newItems, nextPageFetched } = await fetchTmdbCatalogDirect(client, endpoint, cached.nextPage, customParams, type, 1);
            const updatedItems = mergeCatalogItems(cachedItems, newItems);
            await TmdbRequestCache.set(requestHash, endpoint, updatedItems, nextPageFetched);

            return normalizedSkip === 0 ? updatedItems : updatedItems.slice(normalizedSkip, normalizedSkip + fetchSize);
        }
    } catch (_e) {
        // Cache non disponibile, o cache throwato, procediamo
    }

    // Scenario A: Cache Miss — chiama TMDB e salva in cache
    const pagesToFetch = (normalizedSkip === 0) ? PAGES_PER_REQUEST : 1;
    let startPage = 1;

    // Se stiamo richiedendo skip > 0 ma la cache non esiste (spartita per TTL o riavvio container)
    // Non abbiamo idea di quale startPage accurata usare. Facciamo il fallback best-effort.
    if (normalizedSkip > 0) {
        startPage = Math.floor(normalizedSkip / ITEMS_PER_PAGE) + 1;
    }

    const { items: results, nextPageFetched } = await fetchTmdbCatalogDirect(client, endpoint, startPage, customParams, type, pagesToFetch);

    // Salvataggio solo per la prima pagina,
    // così la cache rappresenta una lista progressiva a partire da skip 0.
    if (normalizedSkip === 0) {
        await TmdbRequestCache.set(requestHash, endpoint, results, nextPageFetched);
    }

    return results;
}

/**
 * Recupera le stagioni e gli episodi per una Serie TV da TMDB
 */
async function fetchTmdbEpisodes(client, tmdbId, totalSeasons, imdbId) {
    try {
        const promises = [];
        // TMDB Seasons are 1-indexed. Sometimes there is Season 0 (Specials).
        // For performance, we fetch up to the most recent 5 seasons if a show is huge.
        const startSeason = totalSeasons > 5 ? totalSeasons - 4 : 1;

        for (let i = startSeason; i <= totalSeasons; i++) {
            promises.push(client.get(`/tv/${tmdbId}/season/${i}`));
        }

        const results = await Promise.allSettled(promises);
        const videos = [];

        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value?.data?.episodes) {
                const seasonData = res.value.data;
                seasonData.episodes.forEach(ep => {
                    videos.push({
                        // Usa IMDB ID se disponibile, essenziale per Torrentio!
                        id: imdbId ? `${imdbId}:${ep.season_number}:${ep.episode_number}` : `tmdb:${tmdbId}:${ep.season_number}:${ep.episode_number}`,
                        title: ep.name || `Episodio ${ep.episode_number}`,
                        released: ep.air_date ? new Date(ep.air_date).toISOString() : null,
                        season: ep.season_number,
                        episode: ep.episode_number,
                        overview: ep.overview || '',
                        thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null
                    });
                });
            }
        });

        return videos;
    } catch (e) {
        console.error("Errore fetchTmdbEpisodes:", e.message);
        return [];
    }
}

/**
 * Ottiene i dettagli completi per il Meta Handler di Stremio
 */
async function getTmdbMetaDetails(apiKey, id, type) {
    const tmdbId = id.replace('tmdb:', '').trim();

    // Validate tmdbId is a number to prevent path injection
    if (!/^\d+$/.test(tmdbId)) {
        console.error(`ID TMDB non valido: ${tmdbId}`);
        return null;
    }

    const cacheKey = `${type}:${tmdbId}`;
    const targetMetaCache = type === 'series' ? seriesMetaCache : movieMetaCache;
    const cached = await targetMetaCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const client = createTmdbClient(apiKey);
    const endpoint = type === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;

    try {
        const res = await client.get(endpoint, {
            params: { append_to_response: 'videos,credits,images,external_ids,release_dates,content_ratings,keywords', include_image_language: 'it,en,null' }
        });

        const data = res.data;
        if (!data) return null;

        // Fallback linguistico: IT → EN → lingua originale
        // Se overview o titolo mancanti in italiano, proviamo inglese poi originale
        const itTitle = data.title || data.name;
        const originalTitle = data.original_title || data.original_name;
        const isItalianOriginal = data.original_language === 'it';
        const titleNeedsFallback = !isItalianOriginal && itTitle && originalTitle && itTitle === originalTitle;
        const overviewNeedsFallback = !data.overview;

        if (titleNeedsFallback || overviewNeedsFallback) {
            try {
                const enRes = await client.get(endpoint, { params: { language: 'en-US' } });
                const enData = enRes.data;
                if (enData) {
                    if (overviewNeedsFallback && enData.overview) {
                        data.overview = enData.overview;
                    }
                    if (titleNeedsFallback) {
                        const enTitle = enData.title || enData.name;
                        if (enTitle && enTitle !== originalTitle) {
                            if (data.title !== undefined) data.title = enTitle;
                            if (data.name !== undefined) data.name = enTitle;
                        }
                    }
                }
                // Se overview ancora assente, prova lingua originale
                if (!data.overview && data.original_language) {
                    const origRes = await client.get(endpoint, { params: { language: data.original_language } });
                    if (origRes.data?.overview) {
                        data.overview = origRes.data.overview;
                    }
                }
            } catch (_e) { /* fallback silenzioso */ }
        }

        const meta = toStremioMetaItem(data, type);
        if (!meta) return null;

        // Aggiungiamo metadati avanzati
        if (data.credits && data.credits.cast) {
            meta.cast = data.credits.cast.slice(0, 10).map(c => c.name);
        }
        if (data.genres) {
            meta.genres = data.genres.map(g => g.name);
        }
        if (data.runtime) {
            meta.runtime = `${data.runtime}m`;
        }
        if (type === 'series' && data.episode_run_time?.length > 0) {
            meta.runtime = `${data.episode_run_time[0]}m`;
        }

        // Sito ufficiale
        if (data.homepage) {
            meta.website = data.homepage;
        }

        // Registi / Creatori
        if (type === 'movie' && data.credits?.crew) {
            const directors = data.credits.crew.filter(c => c.job === 'Director').slice(0, 3);
            if (directors.length > 0) {
                meta.director = directors.map(d => d.name);
            }
        } else if (type === 'series' && data.created_by?.length > 0) {
            meta.director = data.created_by.slice(0, 3).map(c => c.name);
        }

        // Deep Links cliccabili: Regia, Cast, Generi, Saga
        meta.links = [];

        // Regia
        const directorNames = meta.director || [];
        for (const name of directorNames) {
            meta.links.push({ name, category: 'Regia', url: `stremio:///search?search=${encodeURIComponent(name)}` });
        }

        // Cast (prime 5 voci)
        if (data.credits?.cast) {
            for (const c of data.credits.cast.slice(0, 5)) {
                meta.links.push({ name: c.name, category: 'Cast', url: `stremio:///search?search=${encodeURIComponent(c.name)}` });
            }
        }

        // Generi
        if (data.genres) {
            for (const g of data.genres) {
                meta.links.push({ name: g.name, category: 'Generi', url: `stremio:///search?search=${encodeURIComponent(g.name)}` });
            }
        }

        // Saga / Collezione (solo film)
        if (data.belongs_to_collection) {
            meta.links.push({
                name: `🎬 ${data.belongs_to_collection.name}`,
                category: 'Saga',
                url: `stremio:///search?search=${encodeURIComponent(data.belongs_to_collection.name)}`
            });
        }

        if (meta.links.length === 0) delete meta.links;

        // Tagline
        if (data.tagline) {
            meta.description = `"${data.tagline}"\n\n${meta.description || ''}`.trim();
        }

        // Estrazione Certificazione Età (Age Rating)
        try {
            if (type === 'movie' && data.release_dates?.results) {
                // Cerchiamo preferibilmente in US o primo disponibile
                const releaseData = data.release_dates.results.find(r => r.iso_3166_1 === 'US') || data.release_dates.results[0];
                if (releaseData?.release_dates?.[0]?.certification) {
                    const cert = releaseData.release_dates[0].certification;
                    if (cert) meta.description = `[${cert}] ${meta.description}`; // Stremio visualizza bene le label testuali nel body
                }
            } else if (type === 'series' && data.content_ratings?.results) {
                const ratingData = data.content_ratings.results.find(r => r.iso_3166_1 === 'US') || data.content_ratings.results[0];
                if (ratingData?.rating) {
                    const cert = ratingData.rating;
                    if (cert) meta.description = `[${cert}] ${meta.description}`;
                }
            }
        } catch (_e) { /* fallback silenzioso se fallisce estrazione certification */ }

        // Informazioni su Network e Status per le Serie TV
        if (type === 'series') {
            try {
                const infoLines = [];
                if (data.networks?.length > 0) {
                    infoLines.push(`📺 Network: ${data.networks.map(n => n.name).join(', ')}`);
                }
                if (data.number_of_seasons) {
                    const episodesPart = data.number_of_episodes ? ` · ${data.number_of_episodes} episodi` : '';
                    infoLines.push(`🎬 ${data.number_of_seasons} stagion${data.number_of_seasons === 1 ? 'e' : 'i'}${episodesPart}`);
                }
                if (data.status) {
                    const isEnded = ['Ended', 'Canceled'].includes(data.status);
                    const statusEmoji = isEnded ? '🔴' : '🟢';
                    let statusLine = `${statusEmoji} Status: ${data.status}`;
                    if (!isEnded && data.next_episode_to_air?.air_date) {
                        const nextDate = new Date(data.next_episode_to_air.air_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
                        statusLine += ` (Prossimo ep: ${nextDate})`;
                    }
                    infoLines.push(statusLine);
                }
                if (infoLines.length > 0) {
                    meta.description = `${infoLines.join('\n')}\n\n${meta.description || ''}`.trim();
                }
            } catch (_e) { /* fallback silenzioso */ }
        }

        // Poster con fallback linguistico: IT → EN → originale (null) → poster_path
        if (data.images && data.images.posters && data.images.posters.length > 0) {
            const itPoster = data.images.posters.find(p => p.iso_639_1 === 'it');
            const enPoster = data.images.posters.find(p => p.iso_639_1 === 'en');
            const nullPoster = data.images.posters.find(p => !p.iso_639_1);
            const bestPoster = itPoster || enPoster || nullPoster;
            if (bestPoster) {
                meta.poster = `https://image.tmdb.org/t/p/w500${bestPoster.file_path}`;
            }
        }

        // Troviamo il ClearLogo (il logo col nome del film trasparente)
        if (data.images && data.images.logos && data.images.logos.length > 0) {
            // Preferiamo quello in italiano, se non c'è prendiamo il primo disponibile (in genere inglese)
            const itLogo = data.images.logos.find(l => l.iso_639_1 === 'it');
            const targetLogo = itLogo || data.images.logos[0];
            meta.logo = `https://image.tmdb.org/t/p/w500${targetLogo.file_path}`;
        }

        // Add Blurred Background link
        if (meta.background) {
            meta.behaviorHints.backgroundBlur = `https://wsrv.nl/?url=${encodeURIComponent(meta.background)}&blur=20`;
        }

        // Troviamo i trailer e altri video (YouTube) e formattiamoli secondo le specifiche Stremio
        if (data.videos && data.videos.results) {
            const allowedVideoTypes = ['Trailer', 'Featurette', 'Behind the Scenes', 'Clip'];
            const videos = data.videos.results.filter(v => v.site === 'YouTube' && allowedVideoTypes.includes(v.type));
            if (videos.length > 0) {
                // Stremio supports array of { source: "youtubeId", type: "Trailer" }
                meta.trailers = videos.map(t => ({ source: t.key, type: t.type }));
            }
        }

        // Se è una serie TV, scarica gli episodi per popolare la griglia in Stremio
        if (type === 'series' && data.number_of_seasons) {
            meta.videos = await fetchTmdbEpisodes(client, tmdbId, data.number_of_seasons, meta.id.startsWith('tt') ? meta.id : null);
        }

        if (meta) {
            await targetMetaCache.set(cacheKey, meta);
        }

        return meta;

    } catch (err) {
        console.error("Errore TMDB Meta:", err.message);
        return null;
    }
}

const tmdbDetailsCache = new CacheManager('tmdb_details_raw', { ramMax: 1000, ramTtlMs: 24 * 60 * 60 * 1000, mongoTtlMs: MOVIE_DETAILS_TTL_MS });

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
