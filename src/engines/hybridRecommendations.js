const axios = require('axios');
const LRUCache = require('../utils/LRUCache');
const { RECOMMENDATIONS_CACHE_TTL_MS, ITEMS_PER_PAGE } = require('../config');
const TasteProfile = require('../db/models/TasteProfile');
const User = require('../db/models/User');
const ProfileBuilder = require('../profile/ProfileBuilder');
const ProfileScorer = require('../profile/ProfileScorer');
const tmdb = require('../clients/tmdb');

// Cache per i cataloghi finali generati (RAM L1)
const catalogCache = new LRUCache({ max: 100, ttl: RECOMMENDATIONS_CACHE_TTL_MS });

/**
 * Recupera l'ultima history da Trakt (limitata per performance).
 */
async function fetchRecentHistory(traktToken, mediaType, limit = 10) {
    if (!traktToken || !process.env.TRAKT_CLIENT_ID) return [];
    try {
        const res = await axios.get(`https://api.trakt.tv/users/me/history/${mediaType}`, {
            headers: {
                'trakt-api-version': '2',
                'trakt-api-key': process.env.TRAKT_CLIENT_ID,
                'Authorization': `Bearer ${traktToken}`
            },
            params: { limit, page: 1 },
            timeout: 10000
        });
        return res.data || [];
    } catch (_e) {
        return [];
    }
}

function extractPillarParams(manualPillars = []) {
    const params = {};
    if (!manualPillars.length) return params;

    const genres = manualPillars.filter(p => p.type === 'genre').map(p => p.id);
    const keywords = manualPillars.filter(p => p.type === 'keyword').map(p => p.id);
    const countries = manualPillars.filter(p => p.type === 'country').map(p => p.id);

    if (genres.length) params.with_genres = genres.join(',');
    if (keywords.length) params.with_keywords = keywords.join(',');
    if (countries.length) params.with_origin_country = countries.join(',');

    return params;
}

/**
 * 🔱 Signature: The Core (Top Genre + Top Keyword + Pillars. Cascade esatta -> broad)
 */
async function buildSignatureCore(userId, context, tmdbApiKey, mediaType) {
    const [profile, user] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        User.findOne({ userId })
    ]);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const settings = user?.profiles?.find(p => p.id === context)?.settings || {};
    const pillars = settings.manualPillars || [];
    const pillarParams = extractPillarParams(pillars);

    const topGenres = [...profile.genreScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    const topKeywords = [...profile.keywordScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

    let results = [];
    const existingIds = new Set();

    const fetchAndAdd = async (params) => {
        try {
            const res = await axios.get(`https://api.themoviedb.org/3/discover/${types}`, {
                params: { ...params, api_key: tmdbApiKey, sort_by: 'popularity.desc' },
                timeout: 5000
            });
            for (const item of (res.data?.results || [])) {
                if (!existingIds.has(item.id)) {
                    results.push(item);
                    existingIds.add(item.id);
                }
            }
        } catch (e) { }
    };

    // Cascade 1: Super Exact (Top Genre + Top Keyword + Pillars)
    if (topGenres.length && topKeywords.length) {
        await fetchAndAdd({
            ...pillarParams,
            with_genres: topGenres[0] + (pillarParams.with_genres ? ',' + pillarParams.with_genres : ''),
            with_keywords: topKeywords[0] + (pillarParams.with_keywords ? ',' + pillarParams.with_keywords : '')
        });
    }

    // Cascade 2: Any Top 3 Genre + Any Top 3 Keyword + Pillars
    if (results.length < 20) {
        const promises = [];
        for (let g of topGenres) {
            for (let k of topKeywords) {
                promises.push(fetchAndAdd({
                    ...pillarParams,
                    with_genres: g + (pillarParams.with_genres ? ',' + pillarParams.with_genres : ''),
                    with_keywords: k + (pillarParams.with_keywords ? ',' + pillarParams.with_keywords : '')
                }));
            }
        }
        await Promise.allSettled(promises);
    }

    // Final score
    const scored = await Promise.all(results.map(async (item) => {
        const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, item.id, types);
        const score = ProfileScorer.calculateItemMatch(details, profile);
        return { data: item, score };
    }));

    return scored.sort((a, b) => b.score - a.score).map(i => String(i.data.id));
}

/**
 * 🌀 Signature: The Blend (Mix di gusti + Fallback Pillars)
 */
async function buildSignatureBlend(userId, context, tmdbApiKey, mediaType) {
    const [profile, user] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        User.findOne({ userId })
    ]);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const settings = user?.profiles?.find(p => p.id === context)?.settings || {};
    const pillars = settings.manualPillars || [];
    let pillarParams = extractPillarParams(pillars);

    const topGenres = [...profile.genreScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);

    const fetchBatch = async (params) => {
        try {
            const res = await axios.get(`https://api.themoviedb.org/3/discover/${types}`, {
                params: { ...params, api_key: tmdbApiKey, sort_by: 'popularity.desc' },
                timeout: 5000
            });
            return res.data?.results || [];
        } catch (e) { return []; }
    };

    let results = [];
    const queries = topGenres.map(g => ({
        ...pillarParams,
        with_genres: g + (pillarParams.with_genres ? ',' + pillarParams.with_genres : '')
    }));

    let allResults = await Promise.allSettled(queries.map(q => fetchBatch(q)));
    allResults.forEach(r => {
        if (r.status === 'fulfilled') {
            r.value.forEach(item => {
                if (!results.find(x => x.id === item.id)) results.push(item);
            });
        }
    });

    // FALLBACK ZERO RESULTS ALGORITHM
    if (results.length === 0 && pillars.length > 0) {
        console.warn(`[Fallback] Zero Blend results per ${userId}/${context}. Disattivo i pillars.`);
        const queriesNoPillar = topGenres.map(g => ({ with_genres: g }));
        allResults = await Promise.allSettled(queriesNoPillar.map(q => fetchBatch(q)));
        allResults.forEach(r => {
            if (r.status === 'fulfilled') {
                r.value.forEach(item => {
                    if (!results.find(x => x.id === item.id)) results.push(item);
                });
            }
        });
    }

    const scored = await Promise.all(results.map(async (item) => {
        const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, item.id, types);
        const score = ProfileScorer.calculateItemMatch(details, profile);
        return { data: item, score };
    }));

    const final = scored.sort((a, b) => b.score - a.score);
    return final.slice(0, 60).map(i => String(i.data.id));
}

/**
 * ⭐ Signature: Rising Star (Popular + Pillars + Trakt Watchlist/History Influence)
 */
async function buildSignatureStar(userId, context, traktToken, tmdbApiKey, mediaType) {
    const [profile, user] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        User.findOne({ userId })
    ]);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const settings = user?.profiles?.find(p => p.id === context)?.settings || {};
    const pillars = settings.manualPillars || [];
    const pillarParams = extractPillarParams(pillars);

    const history = await fetchRecentHistory(traktToken, mediaType === 'movie' ? 'movies' : 'shows', 5);
    const traktRecs = [];
    if (history.length > 0) {
        const promises = history.slice(0, 3).map(item => {
            const id = item.movie?.ids?.tmdb || item.show?.ids?.tmdb;
            return axios.get(`https://api.themoviedb.org/3/${types}/${id}/recommendations`, {
                params: { api_key: tmdbApiKey },
                timeout: 5000
            }).catch(() => null);
        });
        const results = await Promise.allSettled(promises);
        results.forEach(r => {
            if (r.status === 'fulfilled' && r.value?.data?.results) traktRecs.push(...r.value.data.results);
        });
    }

    // Discover Popolari resinosi + Pillars
    const searchRes = await axios.get(`https://api.themoviedb.org/3/discover/${types}`, {
        params: { ...pillarParams, api_key: tmdbApiKey, 'vote_average.gte': 7, sort_by: 'popularity.desc' },
        timeout: 5000
    }).catch(() => ({ data: { results: [] } }));

    let combined = [...(searchRes?.data?.results || []), ...traktRecs];
    const uniquePool = [...new Map(combined.map(item => [item.id, item])).values()];

    const scored = await Promise.all(uniquePool.slice(0, 50).map(async (item) => {
        const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, item.id, types);
        const score = ProfileScorer.calculateItemMatch(details, profile);
        return { data: item, score };
    }));

    return scored.sort((a, b) => b.score - a.score).slice(0, 20).map(i => String(i.data.id));
}

/**
 * Endpoint principale: gestisce la richiesta di un catalogo ibrido profilato.
 */
async function getHybridCatalog(catalogId, skip, traktToken, tmdbApiKey, userId, activeProfileId = 'global') {
    const mediaType = (catalogId.includes('series') || catalogId.includes('tv')) ? 'series' : 'movie';
    const context = activeProfileId || 'global';
    const cacheKey = `${userId}_${context}_${catalogId}`;

    // Sincronizzazione Profile in Background se necessario
    TasteProfile.findOne({ owner: userId, context }).then(async (profile) => {
        const now = new Date();
        const isStale = !profile || (now - profile.lastUpdated) > (1000 * 60 * 60 * 12); // 12 ore
        if (isStale) {
            console.log(`[Hybrid] Sincronizzazione profilo per ${userId} (${context})...`);
            const history = await fetchRecentHistory(traktToken, mediaType === 'movie' ? 'movies' : 'shows', 20);
            await ProfileBuilder.syncUserHistory(userId, context, history, tmdbApiKey);
            catalogCache.delete(cacheKey); // Invalida cache per forzare ricalcolo al prossimo giro
        }
    }).catch(err => console.error("Errore check stale profile:", err.message));

    let recommendationIds = catalogCache.get(cacheKey);

    if (!recommendationIds) {
        const HYBRID_IDS = new Set(['yaca_signature_core_movies', 'yaca_signature_core_series', 'yaca_hybrid_movies', 'yaca_hybrid_series', 'yaca_top_genres_mix']);
        const DISCOVERY_IDS = new Set(['yaca_signature_blend_movies', 'yaca_signature_blend_series', 'yaca_discovery_movies', 'yaca_discovery_series']);
        const TOP20_IDS = new Set(['yaca_signature_star_movies', 'yaca_signature_star_series', 'yaca_top20_movies', 'yaca_top20_series']);

        if (HYBRID_IDS.has(catalogId)) {
            recommendationIds = await buildSignatureCore(userId, context, tmdbApiKey, mediaType);
        } else if (DISCOVERY_IDS.has(catalogId)) {
            recommendationIds = await buildSignatureBlend(userId, context, tmdbApiKey, mediaType);
        } else if (TOP20_IDS.has(catalogId)) {
            recommendationIds = await buildSignatureStar(userId, context, traktToken, tmdbApiKey, mediaType);
        } else {
            recommendationIds = await buildSignatureCore(userId, context, tmdbApiKey, mediaType);
        }
        catalogCache.set(cacheKey, recommendationIds);
    }

    const pageIds = recommendationIds.slice(skip, skip + ITEMS_PER_PAGE);
    if (pageIds.length === 0) return [];

    const enrichPromises = pageIds.map(async (tmdbId) => {
        return await tmdb.getTmdbMetaDetails(tmdbApiKey, `tmdb:${tmdbId}`, mediaType);
    });

    const results = await Promise.allSettled(enrichPromises);
    return results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);
}

/**
 * Sincronizzazione incrementale profilo utente da history Trakt.
 */
async function syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context = 'global') {
    if (!userId || !traktToken || !tmdbApiKey) return false;
    try {
        const traktType = mediaType === 'movie' ? 'movies' : 'shows';
        const history = await fetchRecentHistory(traktToken, traktType, 20);
        await ProfileBuilder.syncUserHistory(userId, context, history, tmdbApiKey);
        return true;
    } catch (err) {
        console.error(`[Hybrid] syncIncrementalRecommendations failed for ${userId}/${context}:`, err.message);
        return false;
    }
}

module.exports = {
    getHybridCatalog,
    syncIncrementalRecommendations,
    fetchRecentHistory,
    catalogCache
};
