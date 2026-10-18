/**
 * src/stremio/idratazione.js
 *
 * Risoluzione metadati, idratazione card Stremio e paginazione dei candidati (Ticket 41 - Decisione 26/27).
 *
 * Il modulo catalog/serving possiede la composizione delle risposte (card preview Stremio)
 * e la garanzia contrattuale di paginazione post-filtro (Ticket 12/38).
 * L'indice (src/indice) è liberato da HTTP e dalla composizione delle risposte (map §16).
 */

const { ITEMS_PER_PAGE } = require('../config');
const tmdb = require('../clients/tmdb');
const { prioritizeLocalizedImages } = require('../clients/tmdb');
const { normalizeContentId } = require('../catalog/contentId');
const { rateLimitedMap } = require('../infra/rateLimiter');
const { isItemInappropriateForKids } = require('../catalog/kidsModeFilters');
const { isItemAnime } = require('../anime');

async function getDuckDbMetaDetailsSafe(id, type) {
    try {
        const duckDbProvider = require('../indice');
        if (typeof duckDbProvider.getDuckDbMetaDetails === 'function') {
            return await duckDbProvider.getDuckDbMetaDetails(id, type);
        }
    } catch (_e) {}
    return null;
}

/**
 * Risolve i metadati di una card candidato a partire da DuckDB o TMDB.
 */
async function resolveCardDetails(recItem, tmdbApiKey, mediaType, tmdbClientHolder = { client: null }) {
    try {
        const isObj = typeof recItem === 'object' && recItem !== null;
        const tmdbId = isObj ? (recItem.tmdbId !== undefined ? recItem.tmdbId : recItem.id) : recItem;
        const matchScore = isObj ? recItem.matchScore : null;
        const itemFallbackUsed = isObj ? recItem.fallbackUsed : undefined;
        const itemTraktAvailable = isObj ? recItem.traktAvailable : undefined;

        const normalizedId = normalizeContentId(tmdbId);
        const itemMedium = isObj ? (recItem.media_type || (recItem.type === 'series' ? 'tv' : recItem.type)) : null;
        const tmdbType = (itemMedium === 'tv' || itemMedium === 'series') ? 'tv' : (itemMedium === 'movie' ? 'movie' : (mediaType === 'movie' ? 'movie' : 'tv'));
        let item = null;
        try {
            const duckMeta = await getDuckDbMetaDetailsSafe(normalizedId, tmdbType);
            if (duckMeta && duckMeta.rawTMDB) {
                item = duckMeta.rawTMDB;
            }
        } catch (_e) {}

        if (!item) {
            item = await tmdb.getTmdbMovieDetails(tmdbApiKey, normalizedId, tmdbType);
        }

        if (!item) return null;

        let logoUrl = null;
        if (item.images && item.images.logos && item.images.logos.length > 0) {
            const bestLogoArray = prioritizeLocalizedImages(item.images.logos);
            const bestLogoObj = bestLogoArray.length > 0 ? bestLogoArray[0] : null;
            if (bestLogoObj && bestLogoObj.file_path) {
                logoUrl = `https://image.tmdb.org/t/p/w500${bestLogoObj.file_path}`;
            }
        }

        let releaseYear = '';
        try {
            const rawDate = item.release_date || item.first_air_date;
            if (rawDate instanceof Date) {
                releaseYear = !isNaN(rawDate.getTime()) ? rawDate.toISOString().substring(0, 4) : '';
            } else if (typeof rawDate === 'string') {
                releaseYear = rawDate.substring(0, 4);
            } else if (rawDate !== null && rawDate !== undefined) {
                releaseYear = String(rawDate).substring(0, 4);
            }
        } catch (_e) {
            releaseYear = '';
        }

        let imdbRating;
        if (item.vote_average !== null && item.vote_average !== undefined) {
            const num = Number(item.vote_average);
            if (!isNaN(num)) imdbRating = num.toFixed(1);
        }

        const genre_ids = Array.isArray(item.genre_ids)
            ? item.genre_ids
            : (Array.isArray(item.genres) ? item.genres.map(g => g.id).filter(id => id !== null && id !== undefined) : []);
        const keywords = Array.isArray(item.keywords)
            ? item.keywords
            : (item.keywords?.results || item.keywords?.keywords || []);

        const cardType = (tmdbType === 'tv' || tmdbType === 'series') ? 'series' : 'movie';
        const cardMediaType = tmdbType === 'movie' ? 'movie' : 'tv';

        return {
            id: `tmdb:${normalizedId}`,
            type: cardType,
            media_type: cardMediaType,
            name: item.title || item.name || 'Unknown',
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
            posterShape: 'poster',
            background: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
            logo: logoUrl,
            description: item.overview || '',
            releaseInfo: releaseYear,
            imdbRating,
            genre_ids,
            original_language: item.original_language || item.originalLanguage || null,
            keywords,
            _yacaMatch: matchScore,
            ...(itemFallbackUsed !== undefined ? { fallbackUsed: itemFallbackUsed } : {}),
            ...(itemTraktAvailable !== undefined ? { traktAvailable: itemTraktAvailable } : {}),
            rawTMDB: item
        };
    } catch (err) {
        console.error(`[Hydration] Errore risoluzione item ${recItem?.id || recItem}:`, err?.message || err);
        return null;
    }
}

/**
 * Filtro sanitario e di preferenza post-idratazione (kidsMode, animePolicy).
 */
function cardSurvivesFilters(card, { isKidsMode, effectiveTypeSelectors }) {
    if (!card) return false;
    if (isKidsMode && isItemInappropriateForKids(card)) return false;
    if (effectiveTypeSelectors?.anime === 'only' && !isItemAnime(card)) return false;
    if (effectiveTypeSelectors?.anime === 'exclude' && isItemAnime(card)) return false;
    return true;
}

/**
 * Idrata e impagina una lista di ID candidati (Ticket 12 & Ticket 38: il cap si applica DOPO i filtri).
 */
async function idrataEImpaginaCandidati({
    recommendationIds,
    skip = 0,
    limit = ITEMS_PER_PAGE,
    tmdbApiKey,
    mediaType,
    isKidsMode = false,
    effectiveTypeSelectors = null
}) {
    if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
        return [];
    }

    const targetCount = skip + limit;
    const cleanResults = [];
    const tmdbClientHolder = { client: null };
    const BATCH_SIZE = limit;
    let processedIndex = 0;

    for (let i = 0; i < recommendationIds.length && cleanResults.length < targetCount; i += BATCH_SIZE) {
        const chunk = recommendationIds.slice(i, i + BATCH_SIZE);
        processedIndex = i + chunk.length;
        const resolved = await rateLimitedMap(
            chunk,
            recItem => resolveCardDetails(recItem, tmdbApiKey, mediaType, tmdbClientHolder),
            { batchSize: 3, delayMs: 150 }
        );
        for (const card of resolved) {
            if (cardSurvivesFilters(card, { isKidsMode, effectiveTypeSelectors })) {
                cleanResults.push(card);
                if (cleanResults.length >= targetCount) break;
            }
        }
    }

    // Warm-up dei successivi elementi in background
    const nextBatchIds = recommendationIds.slice(processedIndex, processedIndex + limit);
    if (nextBatchIds.length > 0) {
        global.setImmediate(() => {
            rateLimitedMap(
                nextBatchIds,
                async (recItem) => {
                    try {
                        const isObj = typeof recItem === 'object' && recItem !== null;
                        const tmdbId = isObj ? (recItem.tmdbId !== undefined ? recItem.tmdbId : recItem.id) : recItem;
                        const normalizedId = normalizeContentId(tmdbId);
                        const itemMedium = isObj ? (recItem.media_type || (recItem.type === 'series' ? 'tv' : recItem.type)) : null;
                        const tmdbType = (itemMedium === 'tv' || itemMedium === 'series') ? 'tv' : (itemMedium === 'movie' ? 'movie' : (mediaType === 'movie' ? 'movie' : 'tv'));
                        const duckMeta = await getDuckDbMetaDetailsSafe(normalizedId, tmdbType);
                        if (!duckMeta || !duckMeta.rawTMDB) {
                            await tmdb.getTmdbMovieDetails(tmdbApiKey, normalizedId, tmdbType);
                        }
                    } catch (_e) {
                        console.warn('[Idratazione] Errore warm-up background:', _e?.message || _e);
                    }
                },
                { batchSize: 2, delayMs: 150 }
            ).catch(err => console.error('[Background-Warmup] Error:', err.message));
        });
    }

    return cleanResults.slice(skip, skip + limit);
}

module.exports = {
    resolveCardDetails,
    cardSurvivesFilters,
    idrataEImpaginaCandidati
};
