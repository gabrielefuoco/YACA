const { createAxiosInstance } = require('../utils/httpClient');
const LRUCache = require('../utils/LRUCache');
const { TMDB_ENDPOINT, DEFAULT_LANGUAGE, DEFAULT_REGION, PAGES_PER_REQUEST, ITEMS_PER_PAGE } = require('../config');
const { rateLimitedMapFiltered } = require('../utils/rateLimiter');
const { isMovieReleasedDigitally, isMovieReleasedInRegion } = require('../utils/releaseFilter');
const { generateRequestHash } = require('../utils/requestHash');
const TmdbRequestCache = require('../models/TmdbRequestCache');

// Helper interno per costruire oggetti request TMDB
const createTmdbClient = (apiKey) => createAxiosInstance(TMDB_ENDPOINT, {
    baseURL: TMDB_ENDPOINT,
    params: {
        api_key: apiKey,
        language: DEFAULT_LANGUAGE,
        region: DEFAULT_REGION
    },
    timeout: 10000
});

const idNameCache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 60 }); // 1 hour TTL
const imdbIdCache = new LRUCache({ max: 10000, ttl: 1000 * 60 * 60 * 24 * 7 }); // 7 day TTL
const metaCache = new LRUCache({ max: 2000, ttl: 1000 * 60 * 60 * 12 }); // 12 ore TTL per metadati completi

/**
 * Traduce una stringa (es. nome attore o keyword) nel suo ID TMDB effettuando una fetch al volo
 */
async function getTmdbIdByName(apiKey, endpoint, query) {
    if (!query) return null;
    const cacheKey = `${endpoint}:${query.toLowerCase()}`;
    if (idNameCache.has(cacheKey)) return idNameCache.get(cacheKey);

    try {
        const client = createTmdbClient(apiKey);
        const res = await client.get(`/search/${endpoint}`, { params: { query } });
        const id = res.data?.results?.[0]?.id || null;
        if (id) idNameCache.set(cacheKey, id);
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
    if (imdbIdCache.has(cacheKey)) return imdbIdCache.get(cacheKey);

    try {
        const client = createTmdbClient(apiKey);
        const searchType = type === 'movie' ? 'movie' : 'tv';
        const res = await client.get(`/${searchType}/${tmdbId}/external_ids`);
        const imdbId = res.data?.imdb_id || null;
        if (imdbId) imdbIdCache.set(cacheKey, imdbId);
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
async function fetchTmdbCatalogDirect(client, endpoint, skip, customParams = {}, type = 'movie') {
    const startPage = Math.floor((skip || 0) / ITEMS_PER_PAGE) + 1;
    const promises = [];

    // Fetcha N pagine simultaneamente per popolare Stremio più fluidamente (solo se skip è 0 per velocità iniziale)
    // Se skip > 0 carichiamo una pagina alla volta per evitare salti o duplicati
    const pagesToFetch = (skip === 0) ? PAGES_PER_REQUEST : 1;

    for (let i = 0; i < pagesToFetch; i++) {
        const pageParams = { ...customParams, page: startPage + i };
        promises.push(client.get(endpoint, { params: pageParams }));
    }

    try {
        const results = await Promise.allSettled(promises);
        let items = [];

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

        // Applichiamo filtro di rilascio usando rateLimiter batch per non esplodere
        const apiKey = client.defaults.params.api_key;

        const filteredMetas = await rateLimitedMapFiltered(items, async ({ item, type }) => {
            if (type === 'movie' && (!customParams.with_original_language || customParams.with_original_language !== 'ko')) {
                // Esempio: Nascondiamo film non rilasciati in digitale o al di fuori del paese 
                // (Molto utile per evitare flussi vuoti su Torrentio per film appena usciti in USA)
                // Se c'è un filtro regionale stretto o se vogliamo solo roba digitale globale:
                const isReleased = await isMovieReleasedDigitally(item.id, apiKey);
                if (!isReleased) return null;
            }
            // Utilizziamo getTmdbMetaDetails per assicurarci di avere l'IMDB ID e metadati ricchi
            // Fondamentale affinché Torrentio trovi i flussi!
            return await getTmdbMetaDetails(apiKey, `tmdb:${item.id}`, type);
        }, { batchSize: 10, delayMs: 100 });

        return filteredMetas;
    } catch (err) {
        console.error(`Errore fetchTmdbCatalog ${endpoint}:`, err.message);
        return [];
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
 * - Cache Hit Fresca (<24h): ritorna i dati dalla cache all'istante.
 * - Cache Hit Scaduta (>24h): ritorna i dati vecchi, rinnova in background.
 */
async function fetchTmdbCatalog(client, endpoint, skip, customParams = {}, type = 'movie') {
    const normalizedSkip = skip ?? 0;
    const requestHash = generateRequestHash(endpoint, customParams, 0, type);
    const sliceEnd = normalizedSkip + ITEMS_PER_PAGE;

    try {
        const cached = await TmdbRequestCache.get(requestHash);

        if (cached) {
            const cachedItems = Array.isArray(cached.stremioData) ? cached.stremioData : [];
            const cachedSlice = cachedItems.slice(normalizedSkip, sliceEnd);

            if (!cached.isStale) {
                // Scenario B: Cache Hit Fresca — latenza minima
                if (normalizedSkip === 0) {
                    return cachedItems;
                }
                if (cachedItems.length > normalizedSkip) {
                    return cachedSlice;
                }
            }

            if (cached.isStale && cachedItems.length > normalizedSkip) {
                // Scenario C: Cache Hit Scaduta — Stale-While-Revalidate
                // Ritorna dati vecchi all'utente, rinnova in background
                fetchTmdbCatalogDirect(client, endpoint, normalizedSkip, customParams, type)
                    .then(results => TmdbRequestCache.set(requestHash, endpoint, mergeCatalogItems(cachedItems, results)))
                    .catch(e => console.error('Errore rinnovo cache in background:', e.message));

                return normalizedSkip === 0 ? cachedItems : cachedSlice;
            }

            // Scenario D: cache incompleta per lo skip richiesto.
            // Recuperiamo solo la nuova pagina e aggiorniamo la lista in cache.
            const newItems = await fetchTmdbCatalogDirect(client, endpoint, normalizedSkip, customParams, type);
            const updatedItems = mergeCatalogItems(cachedItems, newItems);
            TmdbRequestCache.set(requestHash, endpoint, updatedItems)
                .catch(e => console.error('Errore salvataggio cache:', e.message));

            return normalizedSkip === 0 ? updatedItems : updatedItems.slice(normalizedSkip, sliceEnd);
        }
    } catch (_e) {
        // Cache non disponibile (Supabase down, tabella mancante, ecc.)
        // Procediamo con la chiamata diretta a TMDB
    }

    // Scenario A: Cache Miss — chiama TMDB e salva in cache
    const results = await fetchTmdbCatalogDirect(client, endpoint, normalizedSkip, customParams, type);

    // Salvataggio in background (fire-and-forget) solo per la prima pagina,
    // così la cache rappresenta una lista progressiva a partire da skip 0.
    if (normalizedSkip === 0) {
        TmdbRequestCache.set(requestHash, endpoint, results)
            .catch(e => console.error('Errore salvataggio cache:', e.message));
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
    if (metaCache.has(cacheKey)) {
        return metaCache.get(cacheKey);
    }

    const client = createTmdbClient(apiKey);
    const endpoint = type === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;

    try {
        const res = await client.get(endpoint, {
            // Include videos (trailers) and images (for logos)
            // also we can append credits for cast and external_ids for IMDB ID (streaming fix)
            // appending release_dates for movies age ratings and content_ratings for series
            params: { append_to_response: 'videos,credits,images,external_ids,release_dates,content_ratings', include_image_language: 'it,en,null' }
        });

        const data = res.data;
        if (!data) return null;
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

        // Troviamo il ClearLogo (il logo col nome del film trasparente)
        if (data.images && data.images.logos && data.images.logos.length > 0) {
            // Preferiamo quello in italiano, se non c'è prendiamo il primo disponibile (in genere inglese)
            const itLogo = data.images.logos.find(l => l.iso_639_1 === 'it');
            const targetLogo = itLogo || data.images.logos[0];
            meta.logo = `https://image.tmdb.org/t/p/w500${targetLogo.file_path}`;
        }

        // Add Blurred Background link
        if (meta.background) {
            const host = process.env.HOST_URL || 'http://localhost:7000';
            meta.behaviorHints.backgroundBlur = `${host}/blur?url=${encodeURIComponent(meta.background)}`;
        }

        // Troviamo i trailer (YouTube) e formattiamoli secondo le specifiche Stremio
        if (data.videos && data.videos.results) {
            const trailers = data.videos.results.filter(v => v.site === 'YouTube' && v.type === 'Trailer');
            if (trailers.length > 0) {
                // Stremio supports array of { source: "youtubeId", type: "Trailer" }
                meta.trailers = trailers.map(t => ({ source: t.key, type: t.type }));
            }
        }

        // Se è una serie TV, scarica gli episodi per popolare la griglia in Stremio
        if (type === 'series' && data.number_of_seasons) {
            meta.videos = await fetchTmdbEpisodes(client, tmdbId, data.number_of_seasons, meta.id.startsWith('tt') ? meta.id : null);
        }

        if (meta) {
            metaCache.set(cacheKey, meta);
        }

        return meta;

    } catch (err) {
        console.error("Errore TMDB Meta:", err.message);
        return null;
    }
}

module.exports = {
    createTmdbClient, // Esportato in caso serva passare chiavi specifiche
    fetchTmdbCatalog,
    getTmdbMetaDetails,
    getTmdbIdByName,
    resolveImdbId
};
