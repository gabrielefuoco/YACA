const axios = require('axios');
const { createAxiosInstance } = require('../utils/httpClient');
const LRUCache = require('../utils/LRUCache');
const { RECOMMENDATIONS_CACHE_TTL_MS, ITEMS_PER_PAGE } = require('../config');
const TasteProfile = require('../db/models/TasteProfile');
const User = require('../db/models/User');
const ProfileBuilder = require('../profile/ProfileBuilder');
const ProfileScorer = require('../profile/ProfileScorer');
const tmdb = require('../clients/tmdb');
const { rateLimitedMap } = require('../utils/rateLimiter');
const RecommendationCache = require('../models/RecommendationCache');

const traktApiClient = createAxiosInstance('https://api.trakt.tv');

// Cache per i cataloghi finali generati (RAM Livello 3)
const catalogCache = new LRUCache({ max: 20, ttl: RECOMMENDATIONS_CACHE_TTL_MS });
// Alias per compatibilità con i test
const recommendationsCache = catalogCache;

function normalizeContentId(id) {
    return String(id ?? '').replace(/^tmdb:/i, '').trim();
}

function getDnaFilters(user, context) {
    const settings = user?.profiles?.find(p => p.id === context)?.settings || {};
    return [...(settings.manualDNA || []), ...(settings.suggestedDNA || [])];
}

/**
 * Recupera l'ultima history da Trakt (limitata per performance).
 */
async function fetchRecentHistory(traktToken, mediaType, limit = 10) {
    if (!traktToken || !process.env.TRAKT_CLIENT_ID) return [];
    try {
        const res = await traktApiClient.get(`/users/me/history/${mediaType}`, {
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

async function fetchRecentRatings(traktToken, mediaType, limit = 40) {
    if (!traktToken || !process.env.TRAKT_CLIENT_ID) return [];
    try {
        const res = await traktApiClient.get(`/users/me/ratings/${mediaType}`, {
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

/**
 * Recupera le raccomandazioni grezze di Trakt per l'utente corrente.
 * @param {String} traktToken Token OAuth Trakt
 * @param {String} mediaType 'movies' o 'shows'
 * @param {Number} limit Numero massimo di risultati
 * @returns {Array} Array di oggetti Trakt (con ids.tmdb)
 */
async function fetchTraktRecommendationsRaw(traktToken, mediaType, limit = 40) {
    if (!traktToken || !process.env.TRAKT_CLIENT_ID) return [];
    try {
        const res = await traktApiClient.get(`/recommendations/${mediaType}`, {
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

/**
 * Estrae i top N generi dal profilo (per punteggio decrescente).
 * @param {Object} profile Documento TasteProfile
 * @param {Number} n Numero di generi da estrarre (default 5)
 * @returns {Array} Array di ID genere (stringhe)
 */
function computeTopGenres(profile, n = 5) {
    if (!profile || !profile.genreScores) return [];
    return [...profile.genreScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(e => e[0]);
}

async function fetchPopularFallbackIds(tmdbApiKey, mediaType, limit = 60) {
    const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
    try {
        const res = await axios.get(`https://api.themoviedb.org/3/discover/${tmdbType}`, {
            params: {
                api_key: tmdbApiKey,
                sort_by: 'popularity.desc',
                'vote_count.gte': 50
            },
            timeout: 5000
        });
        return (res.data?.results || [])
            .map(item => normalizeContentId(item.id))
            .filter(Boolean)
            .slice(0, limit);
    } catch (err) {
        console.warn(`[Hybrid] Popular fallback failed for ${mediaType}:`, err.message);
        return [];
    }
}

/**
 * Per ogni seed TMDB ID, recupera i film "simili" e conta quante volte ogni film appare.
 * @param {Array} seedTmdbIds Array di ID TMDB (numeri o stringhe)
 * @param {String} tmdbApiKey Chiave API TMDB
 * @param {String} mediaType 'movie' o 'tv'
 * @returns {Map} Map<tmdbId, appearanceCount>
 */
async function fetchTmdbSimilarCounts(seedTmdbIds, tmdbApiKey, mediaType = 'movie') {
    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const counts = new Map();

    if (!seedTmdbIds || seedTmdbIds.length === 0) return counts;

    const results = await rateLimitedMap(
        seedTmdbIds,
        (id) => axios.get(`https://api.themoviedb.org/3/${types}/${id}/recommendations`, {
            params: { api_key: tmdbApiKey },
            timeout: 5000
        }).catch(() => null),
        { batchSize: 5, delayMs: 50 }
    );

    results.forEach(res => {
        if (res && res.data?.results) {
            for (const item of res.data.results) {
                counts.set(item.id, (counts.get(item.id) || 0) + 1);
            }
        }
    });

    return counts;
}

/**
 * Calcola il punteggio ibrido per un elemento candidato.
 * Combina: punteggio posizione Trakt + bonus TMDB per sovrapposizioni + boost di genere.
 *
 * @param {Object} item Oggetto con { tmdbId, position? }
 * @param {Map} tmdbCounts Map<tmdbId, count> — quante volte appare nei "simili"
 * @param {Array} topGenres Array dei top genre IDs dell'utente (max 3 considerati)
 * @param {Array} itemGenres Array dei genre IDs dell'item
 * @returns {Number} Punteggio ibrido
 */
function calculateHybridScore(item, tmdbCounts, topGenres, itemGenres) {
    let score = 0;

    // 1. Posizione Trakt (50 - position)
    if (item.position !== null && item.position !== undefined) {
        score += Math.max(0, 50 - item.position);
    }

    // 2. Bonus TMDB per sovrapposizioni: floor(100 / 2^(count-1))
    const count = tmdbCounts.get(item.tmdbId) || 0;
    if (count > 0) {
        score += Math.floor(100 / Math.pow(2, count - 1));
    }

    // 3. Boost di genere: top1=+30, top2=+15, top3=+5
    // Normalize to strings for consistent comparison regardless of input type
    const topGenresNorm = topGenres.map(String);
    const itemGenresNorm = itemGenres.map(String);
    const genreBoosts = [30, 15, 5];
    const limit = Math.min(topGenresNorm.length, genreBoosts.length);
    for (let i = 0; i < limit; i++) {
        if (itemGenresNorm.includes(topGenresNorm[i])) {
            score += genreBoosts[i];
        }
    }

    return score;
}

function extractDNAParams(manualDNA = []) {
    const params = {};
    if (!manualDNA.length) return params;

    const genres = manualDNA.filter(p => p.type === 'genre').map(p => p.id);
    const keywords = manualDNA.filter(p => p.type === 'keyword').map(p => p.id);
    const countries = manualDNA.filter(p => p.type === 'country').map(p => p.id);

    // Phase 2.1: Use OR (|) instead of AND (,) for broader results
    if (genres.length) params.with_genres = genres.join('|');
    if (keywords.length) params.with_keywords = keywords.join('|');
    if (countries.length) params.with_origin_country = countries.join('|');

    return params;
}

/**
 * 🔱 Signature: The Core (Top Genre + Top Keyword + DNA. Cascade esatta -> broad)
 */
async function buildSignatureCore(userId, context, tmdbApiKey, mediaType) {
    const [profile, user, globalProfile] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        User.findOne({ userId }),
        context === 'global' ? Promise.resolve(null) : TasteProfile.findOne({ owner: userId, context: 'global' })
    ]);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const settings = user?.profiles?.find(p => p.id === context)?.settings || {};
    const dna = settings.manualDNA || [];
    const dnaFilters = getDnaFilters(user, context);
    const dnaParams = extractDNAParams(dna);

    const topGenres = computeTopGenres(profile, 3);
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
                const normalizedItemId = normalizeContentId(item.id);
                if (!existingIds.has(normalizedItemId)) {
                    results.push(item);
                    existingIds.add(normalizedItemId);
                }
            }
        } catch (err) {
            console.debug(`[Hybrid] discover fetch failed in buildSignatureCore (${types}):`, err.message);
        }
    };

    // Phase 2.1: Use OR (|) for broad results — top genres OR top keywords
    if (topGenres.length && topKeywords.length) {
        await fetchAndAdd({
            ...dnaParams,
            with_genres: topGenres.join('|'),
            with_keywords: topKeywords.join('|')
        });
    }

    // Cascade 2: Any Top 3 Genre + Any Top 3 Keyword + DNA (OR logic)
    if (results.length < 20 && (topGenres.length || topKeywords.length)) {
        const broadParams = { ...dnaParams };
        if (topGenres.length) broadParams.with_genres = topGenres.join('|');
        if (topKeywords.length) broadParams.with_keywords = topKeywords.join('|');
        await fetchAndAdd(broadParams);
    }

    // Final score
    const scored = await rateLimitedMap(
        results,
        async (item) => {
            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, item.id, types);
            const score = ProfileScorer.calculateItemMatch(details, profile, { globalProfile, dnaFilters });
            return { data: item, score };
        },
        { batchSize: 5, delayMs: 50 }
    );

    return scored.sort((a, b) => b.score - a.score).map(i => String(i.data.id));
}

/**
 * 🌀 Signature: The Blend (Mix di gusti + Fallback DNA)
 */
async function buildSignatureBlend(userId, context, tmdbApiKey, mediaType) {
    const [profile, user, globalProfile] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        User.findOne({ userId }),
        context === 'global' ? Promise.resolve(null) : TasteProfile.findOne({ owner: userId, context: 'global' })
    ]);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const settings = user?.profiles?.find(p => p.id === context)?.settings || {};
    const dna = settings.manualDNA || [];
    const dnaFilters = getDnaFilters(user, context);
    let dnaParams = extractDNAParams(dna);

    const topGenres = computeTopGenres(profile, 5);

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
    // Phase 2.1: Use OR (|) — one broad query with all top genres
    const genreOrString = topGenres.join('|');
    const broadQuery = genreOrString ? { ...dnaParams, with_genres: genreOrString } : { ...dnaParams };
    let allResults = await Promise.allSettled([fetchBatch(broadQuery)]);
    allResults.forEach(r => {
        if (r.status === 'fulfilled') {
            r.value.forEach(item => {
                const normalizedItemId = normalizeContentId(item.id);
                if (!results.find(x => normalizeContentId(x.id) === normalizedItemId)) results.push(item);
            });
        }
    });

    // FALLBACK ZERO RESULTS ALGORITHM
    if (results.length === 0 && dna.length > 0) {
        console.warn(`[Fallback] Zero Blend results per ${userId}/${context}. Disattivo il DNA.`);
        const fallbackQuery = genreOrString ? { with_genres: genreOrString } : {};
        allResults = await Promise.allSettled([fetchBatch(fallbackQuery)]);
        allResults.forEach(r => {
            if (r.status === 'fulfilled') {
                r.value.forEach(item => {
                    const normalizedItemId = normalizeContentId(item.id);
                    if (!results.find(x => normalizeContentId(x.id) === normalizedItemId)) results.push(item);
                });
            }
        });
    }

    const scored = await rateLimitedMap(
        results,
        async (item) => {
            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, item.id, types);
            const score = ProfileScorer.calculateItemMatch(details, profile, { globalProfile, dnaFilters });
            return { data: item, score };
        },
        { batchSize: 5, delayMs: 50 }
    );

    const final = scored.sort((a, b) => b.score - a.score);
    return final.slice(0, 60).map(i => String(i.data.id));
}

/**
 * ⭐ Signature: Rising Star (Popular + DNA + Trakt Watchlist/History Influence)
 */
async function buildSignatureStar(userId, context, traktToken, tmdbApiKey, mediaType) {
    const [profile, user, globalProfile] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        User.findOne({ userId }),
        context === 'global' ? Promise.resolve(null) : TasteProfile.findOne({ owner: userId, context: 'global' })
    ]);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const settings = user?.profiles?.find(p => p.id === context)?.settings || {};
    const dna = settings.manualDNA || [];
    const dnaFilters = getDnaFilters(user, context);
    const dnaParams = extractDNAParams(dna);

    const history = await fetchRecentHistory(traktToken, mediaType === 'movie' ? 'movies' : 'shows', 5);
    const traktRecs = [];
    if (history.length > 0) {
        const results = await rateLimitedMap(
            history.slice(0, 3),
            (item) => {
                const id = item.movie?.ids?.tmdb || item.show?.ids?.tmdb;
                return axios.get(`https://api.themoviedb.org/3/${types}/${id}/recommendations`, {
                    params: { api_key: tmdbApiKey },
                    timeout: 5000
                }).catch(() => null);
            },
            { batchSize: 5, delayMs: 50 }
        );
        results.forEach(res => {
            if (res && res.data?.results) traktRecs.push(...res.data.results);
        });
    }

    // Discover Popolari + DNA (Phase 2.1: OR logic)
    const searchRes = await axios.get(`https://api.themoviedb.org/3/discover/${types}`, {
        params: { ...dnaParams, api_key: tmdbApiKey, 'vote_average.gte': 7, sort_by: 'popularity.desc' },
        timeout: 5000
    }).catch(() => ({ data: { results: [] } }));

    let combined = [...(searchRes?.data?.results || []), ...traktRecs];
    const uniquePool = [...new Map(combined.map(item => [normalizeContentId(item.id), item])).values()];

    const scored = await rateLimitedMap(
        uniquePool.slice(0, 50),
        async (item) => {
            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, item.id, types);
            const score = ProfileScorer.calculateItemMatch(details, profile, { globalProfile, dnaFilters });
            return { data: item, score };
        },
        { batchSize: 5, delayMs: 50 }
    );

    return scored.sort((a, b) => b.score - a.score).slice(0, 20).map(i => String(i.data.id));
}

/**
 * 🎯 Hero Catalog 1: True Blend ("Scelti per Te")
 * Unisce Top Popolari + Discovery basin (OR genres/keywords) + Simili a 5 titoli amati.
 * Il ProfileScorer riordina il pool e il DNA penalizza i titoli fuori tema.
 */
async function buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType) {
    const [profile, user, globalProfile] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        User.findOne({ userId }),
        context === 'global' ? Promise.resolve(null) : TasteProfile.findOne({ owner: userId, context: 'global' })
    ]);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const settings = user?.profiles?.find(p => p.id === context)?.settings || {};
    const dna = settings.manualDNA || [];
    const dnaParams = extractDNAParams(dna);
    const dnaFilters = getDnaFilters(user, context);

    const topGenres = computeTopGenres(profile, 5);
    const topKeywords = [...profile.keywordScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);

    const existingIds = new Set();
    let pool = [];

    const addResults = (items) => {
        for (const item of (items || [])) {
            const normalizedItemId = normalizeContentId(item?.id);
            if (item && !existingIds.has(normalizedItemId)) {
                pool.push(item);
                existingIds.add(normalizedItemId);
            }
        }
    };

    const fetchDiscover = async (params) => {
        try {
            const res = await axios.get(`https://api.themoviedb.org/3/discover/${types}`, {
                params: { ...params, api_key: tmdbApiKey, sort_by: 'popularity.desc' },
                timeout: 5000
            });
            return res.data?.results || [];
        } catch (_e) { return []; }
    };

    // Source 1: Top Popular (no genre filter)
    addResults(await fetchDiscover({ ...dnaParams, sort_by: 'popularity.desc' }));

    // Source 2: Discovery basin — OR on top genres + top keywords (Phase 2.1)
    const discoveryParams = { ...dnaParams };
    if (topGenres.length) discoveryParams.with_genres = topGenres.join('|');
    if (topKeywords.length) discoveryParams.with_keywords = topKeywords.join('|');
    addResults(await fetchDiscover(discoveryParams));

    // Source 3: Simili a 5 titoli amati casuali dal profilo
    const lovedIds = (user?.profiles?.find(p => p.id === context)?.loved || []).slice(0, 5);
    if (lovedIds.length > 0) {
        const similarResults = await rateLimitedMap(
            lovedIds,
            (id) => axios.get(`https://api.themoviedb.org/3/${types}/${id}/recommendations`, {
                params: { api_key: tmdbApiKey },
                timeout: 5000
            }).catch(() => null),
            { batchSize: 5, delayMs: 50 }
        );
        similarResults.forEach(res => {
            if (res && res.data?.results) {
                addResults(res.data.results);
            }
        });
    }

    // Score and filter with ProfileScorer (DNA acts as bouncer)
    const scored = await rateLimitedMap(
        pool.slice(0, 100),
        async (item) => {
            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, item.id, types);
            const score = ProfileScorer.calculateItemMatch(details, profile, { dnaFilters, globalProfile });
            return { data: item, score };
        },
        { batchSize: 5, delayMs: 50 }
    );

    return scored.sort((a, b) => b.score - a.score).slice(0, 100).map(i => String(i.data.id));
}

/**
 * 🕸️ Hero Catalog 2: Super-Seed Network ("La Rete dei tuoi Preferiti")
 * Legge dal DB: Trakt Recs (peso +3), Loved (peso +2), Liked (peso +1).
 * Chiede TMDB /similar per ogni seed, somma i pesi (stacking).
 */
async function buildHybridCatalog(userId, context, traktToken, tmdbApiKey, mediaType) {
    const [profile, user, globalProfile] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        User.findOne({ userId }),
        context === 'global' ? Promise.resolve(null) : TasteProfile.findOne({ owner: userId, context: 'global' })
    ]);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const dnaFilters = getDnaFilters(user, context);

    const topGenres = computeTopGenres(profile, 3);

    // Gather seeds with weights
    const lovedIds = (user?.profiles?.find(p => p.id === context)?.loved || []).slice(0, 20).map(id => ({ id: String(id), weight: 2 }));
    const likedIds = (user?.profiles?.find(p => p.id === context)?.liked || []).slice(0, 15).map(id => ({ id: String(id), weight: 1 }));

    // Trakt recs: weight +3
    const traktRaw = await fetchTraktRecommendationsRaw(traktToken, mediaType === 'movie' ? 'movies' : 'shows', 10);
    const traktIds = traktRaw
        .map(item => ({ id: String(item.movie?.ids?.tmdb || item.show?.ids?.tmdb), weight: 3 }))
        .filter(s => s.id && s.id !== 'undefined');

    const allSeeds = [...traktIds, ...lovedIds, ...likedIds];
    if (allSeeds.length === 0) {
        // Fallback to signature core
        return buildSignatureCore(userId, context, tmdbApiKey, mediaType);
    }

    // Fetch similar for all seeds, accumulate weighted counts
    const weightedCounts = new Map(); // tmdbId -> weighted score
    const seedTmdbIds = allSeeds.map(s => s.id);

    const allSimilar = await rateLimitedMap(
        allSeeds,
        (seed) => axios.get(`https://api.themoviedb.org/3/${types}/${seed.id}/recommendations`, {
            params: { api_key: tmdbApiKey },
            timeout: 5000
        }).then(res => ({ results: res.data?.results || [], weight: seed.weight }))
            .catch(() => ({ results: [], weight: seed.weight })),
        { batchSize: 5, delayMs: 50 }
    );
    const itemData = new Map(); // tmdbId -> raw item data

    allSimilar.forEach(res => {
        if (res) {
            const { results, weight } = res;
            for (const item of results) {
                const existing = weightedCounts.get(item.id) || 0;
                weightedCounts.set(item.id, existing + weight);
                if (!itemData.has(item.id)) itemData.set(item.id, item);
            }
        }
    });

    // Build items with hybrid score
    const candidates = [];
    for (const [tmdbId, weightedScore] of weightedCounts.entries()) {
        const rawItem = itemData.get(tmdbId);
        if (!rawItem) continue;
        const itemGenres = rawItem.genre_ids || [];
        const hybridScore = calculateHybridScore(
            { tmdbId, position: null },
            new Map([[tmdbId, weightedScore]]),
            topGenres,
            itemGenres
        );
        candidates.push({ data: rawItem, hybridScore });
    }

    candidates.sort((a, b) => b.hybridScore - a.hybridScore);

    // Apply ProfileScorer with DNA filtering
    const scored = await rateLimitedMap(
        candidates.slice(0, 80),
        async ({ data }) => {
            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, data.id, types);
            const score = ProfileScorer.calculateItemMatch(details, profile, { dnaFilters, globalProfile });
            return { data, score };
        },
        { batchSize: 5, delayMs: 50 }
    );

    return scored.sort((a, b) => b.score - a.score).slice(0, 100).map(i => String(i.data.id));
}

/**
 * 💎 Hero Catalog 3: Hidden Gems ("Gemme Nascoste" / Anti-Trash)
 * Cerca titoli affini al profilo con bassa popolarità ma qualità certificata.
 * Applica: minVotes>=100, minAvg>=7.2, Bayesian rating, esclude cortometraggi.
 */
async function buildHiddenGemsCatalog(userId, context, tmdbApiKey, mediaType) {
    const [profile, user, globalProfile] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        User.findOne({ userId }),
        context === 'global' ? Promise.resolve(null) : TasteProfile.findOne({ owner: userId, context: 'global' })
    ]);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const settings = user?.profiles?.find(p => p.id === context)?.settings || {};
    const dna = settings.manualDNA || [];
    const dnaParams = extractDNAParams(dna);
    const dnaFilters = getDnaFilters(user, context);

    const topGenres = computeTopGenres(profile, 3);

    // Quality cage: low popularity, high quality
    const params = {
        ...dnaParams,
        sort_by: 'vote_average.desc',
        'vote_count.gte': 100,
        'vote_average.gte': 7.2,
        'popularity.lte': 20,  // Low popularity threshold
        api_key: tmdbApiKey
    };

    if (topGenres.length) params.with_genres = topGenres.join('|');
    if (types === 'movie') params['with_runtime.gte'] = 60; // Exclude short films

    const results = await axios.get(`https://api.themoviedb.org/3/discover/${types}`, {
        params,
        timeout: 5000
    }).then((res) => res.data?.results || [])
        .catch((err) => {
            console.debug(`[Hybrid] discover fetch failed in buildHiddenGemsCatalog (${types}):`, err.message);
            return [];
        });

    // Apply ProfileScorer with DNA filter
    const scored = await rateLimitedMap(
        results.slice(0, 70),
        async (item) => {
            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, item.id, types);
            const score = ProfileScorer.calculateItemMatch(details, profile, { dnaFilters, globalProfile });
            return { data: item, score };
        },
        { batchSize: 5, delayMs: 50 }
    );

    return scored.sort((a, b) => b.score - a.score).slice(0, 100).map(i => String(i.data.id));
}

/**
 * 🌐 Hero Catalog 4: Trakt Filtered ("Suggeriti dalla Community")
 * Legge le raccomandazioni Trakt dal DB, le passa attraverso il ProfileScorer.
 */
async function buildTraktFilteredCatalog(userId, context, traktToken, tmdbApiKey, mediaType) {
    const [profile, user, globalProfile] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        User.findOne({ userId }),
        context === 'global' ? Promise.resolve(null) : TasteProfile.findOne({ owner: userId, context: 'global' })
    ]);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const dnaFilters = getDnaFilters(user, context);

    // Fetch Trakt recommendations
    const traktRaw = await fetchTraktRecommendationsRaw(traktToken, mediaType === 'movie' ? 'movies' : 'shows', 40);
    const traktTmdbIds = traktRaw
        .map(item => item.movie?.ids?.tmdb || item.show?.ids?.tmdb)
        .filter(Boolean);

    if (traktTmdbIds.length === 0) return [];

    // Enrich and score with ProfileScorer
    const scored = await rateLimitedMap(
        traktTmdbIds.slice(0, 40),
        async (id) => {
            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, id, types);
            if (!details) return null;
            const score = ProfileScorer.calculateItemMatch(details, profile, { dnaFilters, globalProfile });
            return { data: details, score };
        },
        { batchSize: 5, delayMs: 50 }
    );

    return scored
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 100)
        .map(i => String(i.data.id));
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
            const traktType = mediaType === 'movie' ? 'movies' : 'shows';
            const [history, ratings] = await Promise.all([
                fetchRecentHistory(traktToken, traktType, 40),
                fetchRecentRatings(traktToken, traktType, 40)
            ]);
            await ProfileBuilder.syncUserHistory(userId, context, [...history, ...ratings], tmdbApiKey);
            catalogCache.delete(cacheKey); // Invalida RAM
        }
    }).catch(err => console.error("Errore check stale profile:", err.message));

    // Helper to build IDs from scratch
    const buildRecommendIds = async () => {
        // Hero Catalog IDs (Phase 4)
        const TRUE_BLEND_IDS = new Set(['yaca_true_blend_movies', 'yaca_true_blend_series', 'yaca_top_genres_mix']);
        const SEED_NETWORK_IDS = new Set(['yaca_seed_network_movies', 'yaca_seed_network_series']);
        const HIDDEN_GEMS_IDS = new Set(['yaca_hidden_gems_movies', 'yaca_hidden_gems_series']);
        const TRAKT_FILTERED_IDS = new Set(['yaca_trakt_filtered_movies', 'yaca_trakt_filtered_series']);

        // Legacy catalog IDs
        const HYBRID_IDS = new Set(['yaca_signature_core_movies', 'yaca_signature_core_series', 'yaca_hybrid_movies', 'yaca_hybrid_series']);
        const DISCOVERY_IDS = new Set(['yaca_signature_blend_movies', 'yaca_signature_blend_series', 'yaca_discovery_movies', 'yaca_discovery_series']);
        const TOP20_IDS = new Set(['yaca_signature_star_movies', 'yaca_signature_star_series', 'yaca_top20_movies', 'yaca_top20_series']);

        let ids = [];
        if (TRUE_BLEND_IDS.has(catalogId)) {
            ids = await buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType);
        } else if (SEED_NETWORK_IDS.has(catalogId)) {
            ids = await buildHybridCatalog(userId, context, traktToken, tmdbApiKey, mediaType);
        } else if (HIDDEN_GEMS_IDS.has(catalogId)) {
            ids = await buildHiddenGemsCatalog(userId, context, tmdbApiKey, mediaType);
        } else if (TRAKT_FILTERED_IDS.has(catalogId)) {
            ids = await buildTraktFilteredCatalog(userId, context, traktToken, tmdbApiKey, mediaType);
        } else if (HYBRID_IDS.has(catalogId)) {
            ids = await buildSignatureCore(userId, context, tmdbApiKey, mediaType);
        } else if (DISCOVERY_IDS.has(catalogId)) {
            ids = await buildSignatureBlend(userId, context, tmdbApiKey, mediaType);
        } else if (TOP20_IDS.has(catalogId)) {
            ids = await buildSignatureStar(userId, context, traktToken, tmdbApiKey, mediaType);
        } else {
            ids = await buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType);
        }

        await RecommendationCache.set(cacheKey, { ids, updatedAt: Date.now() });
        catalogCache.set(cacheKey, ids);
        return ids;
    };

    // 1. Try RAM (L1/L3)
    let recommendationIds = catalogCache.get(cacheKey);

    // 2. Try L2 (Persistent)
    if (!recommendationIds) {
        const cachedEntry = await RecommendationCache.get(cacheKey);
        if (cachedEntry) {
            recommendationIds = cachedEntry.ids;
            catalogCache.set(cacheKey, recommendationIds);

            // AGGRESSIVE SWR: If stale, revalidate in background
            const age = Date.now() - (cachedEntry.updatedAt || 0);
            if (age > 1000 * 60 * 60 * 4) { // 4h staleness threshold for background refresh
                console.log(`[Hybrid-SWR] Revalidando catalogo ${catalogId} in background...`);
                buildRecommendIds().catch(e => console.error('[Hybrid-SWR] Error:', e.message));
            }
        }
    }

    // 3. Fallback: Build from scratch
    if (!recommendationIds) {
        recommendationIds = await buildRecommendIds();
    }

    if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
        recommendationIds = await fetchPopularFallbackIds(tmdbApiKey, mediaType);
        if (recommendationIds.length > 0) {
            await RecommendationCache.set(cacheKey, { ids: recommendationIds, updatedAt: Date.now() });
            catalogCache.set(cacheKey, recommendationIds);
        }
    }

    const pageIds = recommendationIds.slice(skip, skip + ITEMS_PER_PAGE);
    if (pageIds.length === 0) return [];

    const results = await rateLimitedMap(
        pageIds,
        (tmdbId) => tmdb.getTmdbMetaDetails(tmdbApiKey, `tmdb:${tmdbId}`, mediaType),
        { batchSize: 5, delayMs: 50 }
    );

    return results.filter(Boolean);
}

/**
 * Sincronizzazione incrementale profilo utente da history Trakt.
 */
async function syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context = 'global') {
    if (!userId || !traktToken || !tmdbApiKey) return false;
    try {
        const traktType = mediaType === 'movie' ? 'movies' : 'shows';
        const [history, ratings] = await Promise.all([
            fetchRecentHistory(traktToken, traktType, 40),
            fetchRecentRatings(traktToken, traktType, 40)
        ]);
        await ProfileBuilder.syncUserHistory(userId, context, [...history, ...ratings], tmdbApiKey);
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
    fetchRecentRatings,
    fetchTraktRecommendationsRaw,
    fetchTmdbSimilarCounts,
    calculateHybridScore,
    computeTopGenres,
    fetchPopularFallbackIds,
    buildHybridCatalog,
    buildTopGenresMixCatalog,
    catalogCache,
    recommendationsCache
};
