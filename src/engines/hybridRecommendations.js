const axios = require('axios');
const LRUCache = require('../utils/LRUCache');
const { RECOMMENDATIONS_CACHE_TTL_MS, ITEMS_PER_PAGE } = require('../config');

// Cache dedicata per le raccomandazioni ibride (4h TTL, max 50 utenti)
const recommendationsCache = new LRUCache({ max: 50, ttl: RECOMMENDATIONS_CACHE_TTL_MS });

/**
 * Recupera gli ultimi N item dalla History Trakt dell'utente.
 * @param {string} traktToken - Token OAuth Trakt
 * @param {string} mediaType - 'movies' o 'shows'
 * @param {number} limit - Numero massimo di item
 * @returns {Promise<Array>} Array di oggetti con { tmdbId, imdbId, genreIds }
 */
async function fetchRecentHistory(traktToken, mediaType, limit = 10) {
    if (!traktToken || !process.env.TRAKT_CLIENT_ID) return [];
    try {
        const res = await axios.get(`https://api.trakt.tv/users/me/history/${mediaType}`, {
            headers: {
                'Content-Type': 'application/json',
                'trakt-api-version': '2',
                'trakt-api-key': process.env.TRAKT_CLIENT_ID,
                'Authorization': `Bearer ${traktToken}`
            },
            params: { limit, page: 1 },
            timeout: 10000
        });
        const items = res.data || [];
        const seen = new Set();
        return items.reduce((acc, entry) => {
            const item = entry.movie || entry.show;
            if (!item || !item.ids) return acc;
            const tmdbId = item.ids.tmdb;
            if (!tmdbId || seen.has(tmdbId)) return acc;
            seen.add(tmdbId);
            acc.push({ tmdbId, imdbId: item.ids.imdb, title: item.title });
            return acc;
        }, []);
    } catch (_e) {
        return [];
    }
}

/**
 * Recupera fino a 40 raccomandazioni native Trakt con la posizione originale.
 * @param {string} traktToken - Token OAuth Trakt
 * @param {string} endpoint - 'movies' o 'shows'
 * @returns {Promise<Array>} Array di { tmdbId, imdbId, position }
 */
async function fetchTraktRecommendationsRaw(traktToken, endpoint) {
    if (!traktToken || !process.env.TRAKT_CLIENT_ID) return [];
    try {
        const res = await axios.get(`https://api.trakt.tv/recommendations/${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                'trakt-api-version': '2',
                'trakt-api-key': process.env.TRAKT_CLIENT_ID,
                'Authorization': `Bearer ${traktToken}`
            },
            params: { limit: 40, page: 1 },
            timeout: 10000
        });
        return (res.data || []).map((item, index) => {
            const ids = item.ids || {};
            return { tmdbId: ids.tmdb, imdbId: ids.imdb, title: item.title, position: index + 1 };
        }).filter(i => i.tmdbId);
    } catch (_e) {
        return [];
    }
}

/**
 * Per ogni titolo nella history recente, chiede a TMDB i titoli simili.
 * Restituisce una mappa tmdbId → numero di apparizioni.
 * @param {Array} historyItems - Array da fetchRecentHistory
 * @param {string} tmdbApiKey - Chiave TMDB
 * @param {string} tmdbType - 'movie' o 'tv'
 * @returns {Promise<Map<number, number>>} Map(tmdbId → conteggio apparizioni)
 */
async function fetchTmdbSimilarCounts(historyItems, tmdbApiKey, tmdbType) {
    const counts = new Map();
    if (!historyItems.length || !tmdbApiKey) return counts;

    const promises = historyItems.map(item =>
        axios.get(`https://api.themoviedb.org/3/${tmdbType}/${item.tmdbId}/recommendations`, {
            params: { api_key: tmdbApiKey, language: 'it-IT', page: 1 },
            timeout: 8000
        }).catch(() => null)
    );

    const results = await Promise.allSettled(promises);
    for (const result of results) {
        const data = result.status === 'fulfilled' ? result.value?.data : null;
        if (!data || !data.results) continue;
        for (const rec of data.results) {
            if (rec.id) {
                counts.set(rec.id, (counts.get(rec.id) || 0) + 1);
            }
        }
    }
    return counts;
}

/**
 * Calcola i 3 generi più frequenti dagli ultimi titoli visti (via TMDB).
 * @param {Array} historyItems - Array da fetchRecentHistory
 * @param {string} tmdbApiKey - Chiave TMDB
 * @param {string} tmdbType - 'movie' o 'tv'
 * @returns {Promise<number[]>} Array dei top 3 genre IDs
 */
async function computeTopGenres(historyItems, tmdbApiKey, tmdbType) {
    if (!historyItems.length || !tmdbApiKey) return [];

    const promises = historyItems.map(item =>
        axios.get(`https://api.themoviedb.org/3/${tmdbType}/${item.tmdbId}`, {
            params: { api_key: tmdbApiKey, language: 'it-IT' },
            timeout: 8000
        }).catch(() => null)
    );

    const genreCounts = new Map();
    const results = await Promise.allSettled(promises);
    for (const result of results) {
        const data = result.status === 'fulfilled' ? result.value?.data : null;
        if (!data || !data.genres) continue;
        for (const genre of data.genres) {
            genreCounts.set(genre.id, (genreCounts.get(genre.id) || 0) + 1);
        }
    }

    return [...genreCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);
}

/**
 * Recupera i genre_ids di un titolo TMDB (con fallback silenzioso).
 * @param {number} tmdbId
 * @param {string} tmdbApiKey
 * @param {string} tmdbType - 'movie' o 'tv'
 * @returns {Promise<number[]>}
 */
async function getTitleGenres(tmdbId, tmdbApiKey, tmdbType) {
    try {
        const res = await axios.get(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}`, {
            params: { api_key: tmdbApiKey, language: 'it-IT' },
            timeout: 8000
        });
        return (res.data?.genres || []).map(g => g.id);
    } catch (_e) {
        return [];
    }
}

/**
 * Calcola il TotalScore per un singolo titolo secondo il motore ibrido.
 * @param {object} item - { tmdbId, imdbId, position? }
 * @param {Map} tmdbCounts - Mappa apparizioni TMDB
 * @param {number[]} topGenres - Top 3 genre IDs
 * @param {number[]} itemGenres - Genre IDs del titolo
 * @returns {number} Punteggio totale
 */
function calculateHybridScore(item, tmdbCounts, topGenres, itemGenres) {
    let score = 0;

    // 1. Punteggio Base Trakt: 50 - posizione (da 1 a 40)
    if (item.position) {
        score += 50 - item.position;
    }

    // 2. Bonus Decadente TMDB: 100 / 2^(apparizioni - 1)
    const appearances = tmdbCounts.get(item.tmdbId) || 0;
    if (appearances > 0) {
        score += Math.floor(100 / Math.pow(2, appearances - 1));
    }

    // 3. Boost Affinità Generi
    if (itemGenres && topGenres.length > 0) {
        if (topGenres[0] && itemGenres.includes(topGenres[0])) score += 30;
        if (topGenres[1] && itemGenres.includes(topGenres[1])) score += 15;
        if (topGenres[2] && itemGenres.includes(topGenres[2])) score += 5;
    }

    return score;
}

/**
 * Costruisce il Super-Array ibrido di raccomandazioni per film o serie.
 * Catalogo A (yaca_hybrid_movies) o B (yaca_hybrid_series).
 * @param {string} traktToken - Token OAuth Trakt
 * @param {string} tmdbApiKey - Chiave TMDB
 * @param {string} mediaType - 'movie' o 'series'
 * @returns {Promise<Array>} Super-Array di { tmdbId, imdbId, score }
 */
async function buildHybridCatalog(traktToken, tmdbApiKey, mediaType) {
    const traktType = mediaType === 'movie' ? 'movies' : 'shows';
    const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';

    // FASE 1: Spara tutte le richieste in parallelo
    const [history, traktRecs] = await Promise.all([
        fetchRecentHistory(traktToken, traktType, 10),
        fetchTraktRecommendationsRaw(traktToken, traktType)
    ]);

    // Raccolta set di ID dalla history per filtro anti-noia
    const historyIds = new Set(history.map(h => h.tmdbId));

    // FASE 2: Richieste TMDB in parallelo (similar counts + top genres)
    const [tmdbCounts, topGenres] = await Promise.all([
        fetchTmdbSimilarCounts(history, tmdbApiKey, tmdbType),
        computeTopGenres(history, tmdbApiKey, tmdbType)
    ]);

    // FASE 3: Unisci tutti i candidati (Trakt recs + TMDB similar unici)
    const allCandidates = new Map();

    // Aggiungi raccomandazioni Trakt
    for (const rec of traktRecs) {
        if (!historyIds.has(rec.tmdbId)) {
            allCandidates.set(rec.tmdbId, { tmdbId: rec.tmdbId, imdbId: rec.imdbId, title: rec.title, position: rec.position });
        }
    }

    // Aggiungi candidati TMDB (quelli che non sono già nella mappa)
    for (const [tmdbId] of tmdbCounts) {
        if (!historyIds.has(tmdbId) && !allCandidates.has(tmdbId)) {
            allCandidates.set(tmdbId, { tmdbId, imdbId: null, title: null, position: null });
        }
    }

    // FASE 4: Calcola generi per ogni candidato (in parallelo, batch)
    const candidates = [...allCandidates.values()];
    const genrePromises = candidates.map(c => getTitleGenres(c.tmdbId, tmdbApiKey, tmdbType));
    const genreResults = await Promise.allSettled(genrePromises);

    // FASE 5: Calcola punteggi
    const scoredItems = candidates.map((candidate, idx) => {
        const genres = genreResults[idx].status === 'fulfilled' ? genreResults[idx].value : [];
        const score = calculateHybridScore(candidate, tmdbCounts, topGenres, genres);
        return { ...candidate, score, genres };
    });

    // FASE 6: Ordina per punteggio decrescente
    scoredItems.sort((a, b) => b.score - a.score);

    return scoredItems;
}

/**
 * Costruisce il catalogo "Top Genres Mix" (Catalogo C).
 * Non si basa su titoli specifici ma sull'atmosfera: prende i 3 generi più visti
 * e fa 3 chiamate TMDB Discover in parallelo.
 * @param {string} traktToken - Token OAuth Trakt
 * @param {string} tmdbApiKey - Chiave TMDB
 * @param {string} mediaType - 'movie' o 'series'
 * @returns {Promise<Array>} Array di { tmdbId, imdbId, popularity }
 */
async function buildTopGenresMixCatalog(traktToken, tmdbApiKey, mediaType) {
    const traktType = mediaType === 'movie' ? 'movies' : 'shows';
    const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';

    // Recupera history più estesa per generi (fino a 20)
    const history = await fetchRecentHistory(traktToken, traktType, 20);
    const historyIds = new Set(history.map(h => h.tmdbId));

    const topGenres = await computeTopGenres(history, tmdbApiKey, tmdbType);
    if (topGenres.length === 0) return [];

    // 3 chiamate Discover in parallelo (una per genere)
    const discoverPromises = topGenres.map(genreId =>
        axios.get(`https://api.themoviedb.org/3/discover/${tmdbType}`, {
            params: {
                api_key: tmdbApiKey,
                language: 'it-IT',
                region: 'IT',
                sort_by: 'popularity.desc',
                with_genres: genreId,
                page: 1
            },
            timeout: 10000
        }).catch(() => null)
    );

    const results = await Promise.allSettled(discoverPromises);
    const seen = new Set();
    const items = [];

    for (const result of results) {
        const data = result.status === 'fulfilled' ? result.value?.data : null;
        if (!data || !data.results) continue;
        for (const item of data.results) {
            if (item.id && !seen.has(item.id) && !historyIds.has(item.id)) {
                seen.add(item.id);
                items.push({
                    tmdbId: item.id,
                    imdbId: null,
                    title: item.title || item.name,
                    popularity: item.popularity || 0
                });
            }
        }
    }

    // Ordina per popolarità decrescente
    items.sort((a, b) => b.popularity - a.popularity);
    return items;
}

/**
 * Converte un item del Super-Array nel formato Stremio Meta Preview.
 * @param {object} item - { tmdbId, imdbId, title, score/popularity }
 * @param {string} tmdbApiKey - Chiave TMDB
 * @param {string} mediaType - 'movie' o 'series'
 * @returns {Promise<object|null>} Meta Stremio
 */
async function enrichToStremioMeta(item, tmdbApiKey, mediaType) {
    const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
    try {
        const res = await axios.get(`https://api.themoviedb.org/3/${tmdbType}/${item.tmdbId}`, {
            params: {
                api_key: tmdbApiKey,
                language: 'it-IT',
                append_to_response: 'external_ids'
            },
            timeout: 8000
        });
        const data = res.data;
        if (!data) return null;

        const imdbId = data.external_ids?.imdb_id || item.imdbId;
        const stremioId = imdbId || `tmdb:${item.tmdbId}`;
        const year = data.release_date ? data.release_date.split('-')[0] : (data.first_air_date ? data.first_air_date.split('-')[0] : '');

        return {
            id: stremioId,
            type: mediaType === 'movie' ? 'movie' : 'series',
            name: data.title || data.name || item.title || 'Titolo sconosciuto',
            poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
            background: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null,
            posterShape: 'poster',
            description: data.overview || '',
            releaseInfo: year,
            imdbRating: data.vote_average ? parseFloat(data.vote_average).toFixed(1) : null,
            behaviorHints: mediaType === 'movie'
                ? { defaultVideoId: stremioId }
                : { hasScheduledVideos: true }
        };
    } catch (_e) {
        return null;
    }
}

/**
 * Entry point principale: gestisce la richiesta di un catalogo ibrido con caching e paginazione.
 * @param {string} catalogId - 'yaca_hybrid_movies', 'yaca_hybrid_series', o 'yaca_top_genres_mix'
 * @param {number} skip - Offset paginazione Stremio
 * @param {string} traktToken - Token OAuth Trakt
 * @param {string} tmdbApiKey - Chiave TMDB
 * @returns {Promise<Array>} Array di Stremio Meta items
 */
async function getHybridCatalog(catalogId, skip, traktToken, tmdbApiKey) {
    // Chiave cache unica per utente e catalogo
    const cacheKey = `${traktToken ? traktToken.substring(0, 8) : 'anon'}_${catalogId}`;

    // FASE B: Se la cache ha il Super-Array, taglia la fetta richiesta
    const cached = recommendationsCache.get(cacheKey);
    if (cached) {
        const slice = cached.slice(skip, skip + ITEMS_PER_PAGE);
        return slice;
    }

    // FASE A: Costruzione del Super-Array (solo a skip=0 o cache miss)
    let mediaType;
    if (catalogId === 'yaca_hybrid_movies') mediaType = 'movie';
    else if (catalogId === 'yaca_hybrid_series') mediaType = 'series';
    else mediaType = 'movie'; // Default per top_genres_mix

    let superArray;
    if (catalogId === 'yaca_top_genres_mix') {
        superArray = await buildTopGenresMixCatalog(traktToken, tmdbApiKey, mediaType);
    } else {
        superArray = await buildHybridCatalog(traktToken, tmdbApiKey, mediaType);
    }

    // Arricchisci con metadati Stremio (in parallelo)
    const enrichPromises = superArray.map(item => enrichToStremioMeta(item, tmdbApiKey, mediaType));
    const enrichedResults = await Promise.allSettled(enrichPromises);
    const enrichedArray = enrichedResults
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);

    // Salva nella cache
    recommendationsCache.set(cacheKey, enrichedArray);

    // Ritorna la prima pagina
    return enrichedArray.slice(skip, skip + ITEMS_PER_PAGE);
}

module.exports = {
    getHybridCatalog,
    buildHybridCatalog,
    buildTopGenresMixCatalog,
    calculateHybridScore,
    fetchRecentHistory,
    fetchTraktRecommendationsRaw,
    fetchTmdbSimilarCounts,
    computeTopGenres,
    recommendationsCache
};
