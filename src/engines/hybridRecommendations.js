const { ITEMS_PER_PAGE } = require('../config');
const TasteProfile = require('../db/models/TasteProfile');
const TmdbScoringData = require('../db/models/TmdbScoringData');
const User = require('../db/models/User');
const ProfileBuilder = require('../profile/ProfileBuilder');
const ProfileScorer = require('../profile/ProfileScorer');
const tmdb = require('../clients/tmdb');
const { traktClient } = require('../clients/trakt');
const { hybridRecommendationsCache } = require('../cache/cacheInstances');
const { getProfileDnaFilters } = require('../utils/helpers');
const { rateLimitedMap } = require('../utils/rateLimiter');
const { generateDiscoveryQueries } = require('../ai/querySynthesizer');
const activeSyncLocks = new Set();

function normalizeContentId(id) {
    return String(id ?? '').replace(/^tmdb:/i, '').trim();
}

/**
 * Returns the active profile settings for the user.
 * @param {Object|null} user User document
 * @param {string} context Active profile ID
 * @returns {Object} Profile settings object or an empty object
 */
function getProfileSettings(user, context) {
    return user?.profiles?.find(p => p.id === context)?.settings || {};
}

/**
 * Loads the profile context needed by hybrid catalogs in one place.
 * @param {string} userId Unique user ID
 * @param {string} context Active profile ID
 * @returns {Promise<{profile: Object|null, user: Object|null, globalProfile: Object|null}>}
 */
async function fetchProfileContext(userId, context) {
    const [profile, user, globalProfile] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        User.findOne({ userId }),
        context === 'global' ? Promise.resolve(null) : TasteProfile.findOne({ owner: userId, context: 'global' })
    ]);

    return { profile, user, globalProfile };
}

/**
 * Executes a TMDB query through the standardized client and always returns an array.
 * On failure it logs the issue and returns [] to keep the flow best-effort.
 * @param {Object} tmdbClient Client created with tmdb.createTmdbClient()
 * @param {string} endpoint Relative TMDB endpoint
 * @param {Object} [params={}] Additional query params
 * @param {string} [errorLabel=endpoint] Human-readable label for error logs
 * @returns {Promise<Array>} TMDB results array or [] when the request fails
 */
async function fetchTmdbResults(tmdbClient, endpoint, params = {}, errorLabel = endpoint) {
    try {
        const res = await tmdbClient.get(endpoint, { params, timeout: 5000 });
        return res.data?.results || [];
    } catch (err) {
        console.warn(`[Hybrid] ${errorLabel} failed:`, err.message);
        return [];
    }
}

/**
 * Recupera l'ultima history da Trakt (limitata per performance).
 */
async function fetchRecentHistory(traktToken, mediaType, limit = 10) {
    if (!traktToken || !process.env.TRAKT_CLIENT_ID) return [];
    try {
        const res = await traktClient.get(`/users/me/history/${mediaType}`, {
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
        const res = await traktClient.get(`/users/me/ratings/${mediaType}`, {
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
        const res = await traktClient.get(`/recommendations/${mediaType}`, {
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
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const results = await fetchTmdbResults(
        tmdbClient,
        `/discover/${tmdbType}`,
        { sort_by: 'popularity.desc', 'vote_count.gte': 50 },
        `Popular fallback (${mediaType})`
    );
    return results
        .map(item => normalizeContentId(item.id))
        .filter(Boolean)
        .slice(0, limit);
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
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);

    if (!seedTmdbIds || seedTmdbIds.length === 0) return counts;

    const results = await rateLimitedMap(
        seedTmdbIds,
        (id) => fetchTmdbResults(tmdbClient, `/${types}/${id}/recommendations`, {}, `Similar fetch (${types}/${id})`),
        { batchSize: 5, delayMs: 50 }
    );

    results.forEach(items => {
        if (Array.isArray(items)) {
            for (const item of items) {
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
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const settings = getProfileSettings(user, context);
    const dna = settings.manualDNA || [];
    const dnaFilters = getProfileDnaFilters(user, context);
    const dnaParams = extractDNAParams(dna);

    const topGenres = computeTopGenres(profile, 3);
    const topKeywords = [...profile.keywordScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

    let results = [];
    const existingIds = new Set();

    const fetchAndAdd = async (params) => {
        const items = await fetchTmdbResults(
            tmdbClient,
            `/discover/${types}`,
            { ...params, sort_by: 'popularity.desc' },
            `Signature Core discover (${types})`
        );
        for (const item of items) {
            const normalizedItemId = normalizeContentId(item.id);
            if (!existingIds.has(normalizedItemId)) {
                results.push(item);
                existingIds.add(normalizedItemId);
            }
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
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const settings = getProfileSettings(user, context);
    const dna = settings.manualDNA || [];
    const dnaFilters = getProfileDnaFilters(user, context);
    let dnaParams = extractDNAParams(dna);

    const topGenres = computeTopGenres(profile, 5);

    const fetchBatch = async (params) => {
        return fetchTmdbResults(
            tmdbClient,
            `/discover/${types}`,
            { ...params, sort_by: 'popularity.desc' },
            `Signature Blend discover (${types})`
        );
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
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const settings = getProfileSettings(user, context);
    const dna = settings.manualDNA || [];
    const dnaFilters = getProfileDnaFilters(user, context);
    const dnaParams = extractDNAParams(dna);

    const history = await fetchRecentHistory(traktToken, mediaType === 'movie' ? 'movies' : 'shows', 5);
    const traktRecs = [];
    if (history.length > 0) {
        const results = await rateLimitedMap(
            history.slice(0, 3),
            (item) => {
                const id = item.movie?.ids?.tmdb || item.show?.ids?.tmdb;
                return fetchTmdbResults(tmdbClient, `/${types}/${id}/recommendations`, {}, `Signature Star recommendations (${types}/${id})`);
            },
            { batchSize: 5, delayMs: 50 }
        );
        results.forEach(items => {
            if (Array.isArray(items)) traktRecs.push(...items);
        });
    }

    // Discover Popolari + DNA (Phase 2.1: OR logic)
    const searchResults = await fetchTmdbResults(
        tmdbClient,
        `/discover/${types}`,
        { ...dnaParams, 'vote_average.gte': 7, sort_by: 'popularity.desc' },
        `Signature Star discover (${types})`
    );

    let combined = [...searchResults, ...traktRecs];
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
 * Risolve una singola query AI in parametri TMDB validi.
 * Converte keyword testuali in ID numerici TMDB tramite /search/keyword.
 * @param {Object} aiQuery { genre_ids, keyword, vibe }
 * @param {string} tmdbApiKey
 * @param {string} types 'movie' o 'tv'
 * @returns {Object} Parametri TMDB validi per /discover
 */
async function resolveAiQueryToTmdbParams(aiQuery, tmdbApiKey, types) {
    const params = { api_key: tmdbApiKey };

    if (aiQuery.genre_ids && aiQuery.genre_ids.length > 0) {
        params.with_genres = aiQuery.genre_ids.join('|');
    }

    if (aiQuery.keyword) {
        const isOr = aiQuery.keyword.includes('|');
        const separator = isOr ? '|' : ',';
        const keywordNames = aiQuery.keyword.split(separator).map(k => k.trim()).filter(Boolean);

        const results = await Promise.allSettled(
            keywordNames.map(k => tmdb.getTmdbIdByName(tmdbApiKey, 'keyword', k))
        );
        const validIds = results
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => r.value);

        if (validIds.length > 0) {
            params.with_keywords = validIds.join(separator);
        }
    }

    return params;
}

/**
 * Esegue il Two-Tier Scoring su un pool di candidati.
 * Tier 1: Light Score in RAM (generi + bayesian) → taglio metà inferiore
 * Tier 2: Deep Score sui sopravvissuti (metadati completi)
 * 
 * @param {Array} pool Array di item TMDB "light" (da /discover)
 * @param {Object} profile TasteProfile
 * @param {Object} options { tmdbApiKey, types, dnaFilters, globalProfile }
 * @returns {Array} Array di { data, score } ordinati per score
 */
async function twoTierScore(pool, profile, options) {
    const { tmdbApiKey, types, dnaFilters, globalProfile } = options;

    // --- Tier 1: Light Score in RAM ---
    const lightScored = pool.map(item => {
        const lightData = {
            id: item.id,
            genre_ids: item.genre_ids || [],
            vote_average: item.vote_average || 0,
            vote_count: item.vote_count || 0,
            keywords: item.keywords || []
        };
        const lightScore = ProfileScorer.calculateLightScore(lightData, profile, options);
        return { data: item, lightScore };
    });

    // Taglio Brutale: ordina per Light Score e tieni solo la metà superiore (max 80)
    lightScored.sort((a, b) => b.lightScore - a.lightScore);
    const survivors = lightScored.slice(0, Math.min(80, Math.ceil(lightScored.length / 2)));

    // --- Tier 2: Deep Score con metadati completi ---
    // Prima controlla la Scoring Cache per evitare chiamate API
    const survivorIds = survivors.map(s => s.data.id);
    let scoringCache = new Map();
    try {
        const cached = await TmdbScoringData.find({ tmdbId: { $in: survivorIds }, type: types }).lean();
        for (const doc of cached) {
            scoringCache.set(doc.tmdbId, doc);
        }
    } catch (_e) { /* scoring cache miss is non-blocking */ }

    const scored = await rateLimitedMap(
        survivors,
        async ({ data }) => {
            // Prova prima la scoring cache locale
            const cachedScoring = scoringCache.get(data.id);
            if (cachedScoring) {
                // Ricostruisci un oggetto compatibile con ProfileScorer
                const syntheticData = {
                    id: cachedScoring.tmdbId,
                    genre_ids: cachedScoring.genre_ids,
                    vote_average: cachedScoring.vote_average,
                    vote_count: cachedScoring.vote_count,
                    keywords: { keywords: cachedScoring.keyword_ids.map(id => ({ id })) },
                    credits: {
                        crew: cachedScoring.director_ids.map(id => ({ id, job: 'Director' })),
                        cast: cachedScoring.cast_ids.map(id => ({ id }))
                    }
                };
                const score = ProfileScorer.calculateItemMatch(syntheticData, profile, { dnaFilters, globalProfile });
                return { data, score };
            }

            // Fallback: chiama TMDB per metadati completi
            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, data.id, types);
            if (!details) return { data, score: 0 };

            // Salva in scoring cache in background (fire-and-forget)
            saveScoringData(details, types).catch(() => { });

            const score = ProfileScorer.calculateItemMatch(details, profile, { dnaFilters, globalProfile });
            return { data, score };
        },
        { batchSize: 5, delayMs: 50 }
    );

    return scored.sort((a, b) => b.score - a.score);
}

/**
 * Salva i dati di scoring in cache permanente per un titolo TMDB.
 * @param {Object} tmdbDetails Dati completi TMDB (con credits e keywords)
 * @param {string} type 'movie' o 'tv'
 */
async function saveScoringData(tmdbDetails, type) {
    if (!tmdbDetails || !tmdbDetails.id) return;

    const keywordItems = tmdbDetails.keywords?.keywords || tmdbDetails.keywords?.results || [];
    const directors = (tmdbDetails.credits?.crew || [])
        .filter(c => c.job === 'Director')
        .map(c => c.id)
        .filter(Boolean);
    const cast = (tmdbDetails.credits?.cast || [])
        .slice(0, 5)
        .map(c => c.id)
        .filter(Boolean);
    const genreIds = tmdbDetails.genre_ids || (tmdbDetails.genres ? tmdbDetails.genres.map(g => g.id) : []);

    try {
        await TmdbScoringData.updateOne(
            { tmdbId: tmdbDetails.id, type },
            {
                $set: {
                    vote_average: tmdbDetails.vote_average || 0,
                    vote_count: tmdbDetails.vote_count || 0,
                    genre_ids: genreIds,
                    keyword_ids: keywordItems.map(k => k.id).filter(Boolean),
                    director_ids: directors,
                    cast_ids: cast
                }
            },
            { upsert: true }
        );
    } catch (_e) { /* scoring cache write failure is non-blocking */ }
}

/**
 * 🎯 Hero Catalog 1: True Blend ("Scelti per Te")
 * Usa il Query Synthesizer (Mistral) per generare 2-3 ricerche ampie (OR logic).
 * Paginazione profonda per creare un bacino largo (~150 titoli).
 * Two-Tier Scoring: Light Score → taglio → Deep Score.
 * Fallback al metodo classico se Mistral non è disponibile.
 */
async function buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const settings = getProfileSettings(user, context);
    const dna = settings.manualDNA || [];
    const dnaParams = extractDNAParams(dna);
    const dnaFilters = getProfileDnaFilters(user, context);

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

    const fetchDiscoverPages = async (params, pages = 3) => {
        const results = [];
        for (let page = 1; page <= pages; page++) {
            const pageResults = await fetchTmdbResults(
                tmdbClient,
                `/discover/${types}`,
                { ...params, sort_by: 'popularity.desc', page },
                `Top Genres Mix discover (${types})`
            );
            results.push(...pageResults);
        }
        return results;
    };

    // Source 1: AI Query Synthesizer (Mistral) — genera 2-3 ricerche ampie
    const mistralKey = user?.apiKeys?.mistral;
    let aiQueries = [];
    if (mistralKey) {
        try {
            aiQueries = await generateDiscoveryQueries(profile, mistralKey, 'trueBlend');
        } catch (_e) { /* AI failure falls through to classic fallback */ }
    }

    if (aiQueries.length > 0) {
        // Risolvi keyword testuali in ID TMDB e lancia ricerche parallele con paginazione profonda
        const queryPromises = aiQueries.map(async (q) => {
            const tmdbParams = await resolveAiQueryToTmdbParams(q, tmdbApiKey, types);
            return fetchDiscoverPages({ ...dnaParams, ...tmdbParams }, 3);
        });
        const allResults = await Promise.all(queryPromises);
        allResults.forEach(results => addResults(results));
    } else {
        // Fallback classico: Discovery basin con OR su top genres + top keywords
        const discoveryParams = { ...dnaParams };
        if (topGenres.length) discoveryParams.with_genres = topGenres.join('|');
        if (topKeywords.length) discoveryParams.with_keywords = topKeywords.join('|');
        addResults(await fetchDiscoverPages(discoveryParams, 3));
    }

    // Source 2: Simili a 5 titoli amati casuali dal profilo
    const lovedIds = (user?.profiles?.find(p => p.id === context)?.loved || []).slice(0, 5);
    if (lovedIds.length > 0) {
        const similarResults = await rateLimitedMap(
            lovedIds,
            (id) => fetchTmdbResults(tmdbClient, `/${types}/${id}/recommendations`, {}, `Top Genres Mix recommendations (${types}/${id})`),
            { batchSize: 5, delayMs: 50 }
        );
        similarResults.forEach(items => {
            addResults(items);
        });
    }

    // Two-Tier Scoring: Light → taglio → Deep
    const scored = await twoTierScore(pool, profile, { tmdbApiKey, types, dnaFilters, globalProfile });

    return scored.slice(0, 100).map(i => String(i.data.id));
}

/**
 * 🕸️ Hero Catalog 2: Super-Seed Network ("La Rete dei tuoi Preferiti")
 * Legge dal DB: Trakt Recs (peso +3), Loved (peso +2), Liked (peso +1).
 * Chiede TMDB /similar per ogni seed, somma i pesi (stacking).
 */
async function buildHybridCatalog(userId, context, traktToken, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const dnaFilters = getProfileDnaFilters(user, context);

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
        async (seed) => ({
            results: await fetchTmdbResults(tmdbClient, `/${types}/${seed.id}/recommendations`, {}, `Hybrid recommendations (${types}/${seed.id})`),
            weight: seed.weight
        }),
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
 * Usa il Query Synthesizer (Mistral) per generare 3-4 ricerche iper-specifiche (AND logic).
 * Mantiene filtri di qualità: bassa popolarità, alto rating, minimo voti.
 * Applica Two-Tier Scoring. Fallback al metodo classico se Mistral non è disponibile.
 */
async function buildHiddenGemsCatalog(userId, context, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const settings = getProfileSettings(user, context);
    const dna = settings.manualDNA || [];
    const dnaParams = extractDNAParams(dna);
    const dnaFilters = getProfileDnaFilters(user, context);

    const topGenres = computeTopGenres(profile, 3);

    // Quality cage: relatively low popularity but high quality
    const qualityFilters = {
        sort_by: 'vote_average.desc',
        'vote_count.gte': 100,
        'vote_count.lte': 3000,
        'vote_average.gte': 7.0,
        'popularity.lte': 80 // Limit to less mainstream titles
    };
    if (types === 'movie') qualityFilters['with_runtime.gte'] = 60; // Exclude short films

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

    const fetchDiscoverPages = async (params, pages = 2) => {
        const results = [];
        for (let page = 1; page <= pages; page++) {
            const pageResults = await fetchTmdbResults(
                tmdbClient,
                `/discover/${types}`,
                { ...params, page },
                `Hidden Gems discover (${types})`
            );
            results.push(...pageResults);
        }
        return results;
    };

    // Source 1: AI Query Synthesizer (Mistral) — genera 3-4 ricerche iper-specifiche
    const mistralKey = user?.apiKeys?.mistral;
    let aiQueries = [];
    if (mistralKey) {
        try {
            aiQueries = await generateDiscoveryQueries(profile, mistralKey, 'hiddenGems');
        } catch (_e) { /* AI failure falls through to classic fallback */ }
    }

    if (aiQueries.length > 0) {
        // Risolvi e lancia ricerche parallele con filtri di qualità
        const queryPromises = aiQueries.map(async (q) => {
            const tmdbParams = await resolveAiQueryToTmdbParams(q, tmdbApiKey, types);
            return fetchDiscoverPages({ ...dnaParams, ...tmdbParams, ...qualityFilters }, 2);
        });
        const allResults = await Promise.all(queryPromises);
        allResults.forEach(results => addResults(results));
    } else {
        // Fallback classico: top genres + quality filters
        const params = { ...dnaParams, ...qualityFilters };
        if (topGenres.length) params.with_genres = topGenres.join('|');
        addResults(await fetchDiscoverPages(params, 2));
    }

    // Two-Tier Scoring: Light → taglio → Deep
    const scored = await twoTierScore(pool, profile, { tmdbApiKey, types, dnaFilters, globalProfile, catalogContext: 'hidden_gems' });

    return scored.slice(0, 100).map(i => String(i.data.id));
}

/**
 * 🌐 Hero Catalog 4: Trakt Filtered ("Suggeriti dalla Community")
 * Legge le raccomandazioni Trakt dal DB (100 risultati grezzi), le passa attraverso il ProfileScorer.
 */
async function buildTraktFilteredCatalog(userId, context, traktToken, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return [];

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const dnaFilters = getProfileDnaFilters(user, context);

    // Fetch Trakt recommendations — pool ampliato a 100 per massimizzare lo scoring
    const traktRaw = await fetchTraktRecommendationsRaw(traktToken, mediaType === 'movie' ? 'movies' : 'shows', 100);
    const traktTmdbIds = traktRaw
        .map(item => item.movie?.ids?.tmdb || item.show?.ids?.tmdb)
        .filter(Boolean);

    if (traktTmdbIds.length === 0) return [];

    // Enrich and score with ProfileScorer
    const scored = await rateLimitedMap(
        traktTmdbIds.slice(0, 100),
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
            const synced = await syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context);
            if (synced) {
                await hybridRecommendationsCache.delete(cacheKey);
            }
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

        const ids = TRUE_BLEND_IDS.has(catalogId)
            ? await buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType)
            : SEED_NETWORK_IDS.has(catalogId)
                ? await buildHybridCatalog(userId, context, traktToken, tmdbApiKey, mediaType)
                : HIDDEN_GEMS_IDS.has(catalogId)
                    ? await buildHiddenGemsCatalog(userId, context, tmdbApiKey, mediaType)
                    : TRAKT_FILTERED_IDS.has(catalogId)
                        ? await buildTraktFilteredCatalog(userId, context, traktToken, tmdbApiKey, mediaType)
                        : HYBRID_IDS.has(catalogId)
                            ? await buildSignatureCore(userId, context, tmdbApiKey, mediaType)
                            : DISCOVERY_IDS.has(catalogId)
                                ? await buildSignatureBlend(userId, context, tmdbApiKey, mediaType)
                                : TOP20_IDS.has(catalogId)
                                    ? await buildSignatureStar(userId, context, traktToken, tmdbApiKey, mediaType)
                                    : await buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType);

        await hybridRecommendationsCache.set(cacheKey, { ids });
        return ids;
    };

    let recommendationIds;
    const { value: cachedEntry, status: cacheStatus } = await hybridRecommendationsCache.getWithStatus(cacheKey);
    if (cacheStatus !== 'miss' && Array.isArray(cachedEntry?.ids)) {
        recommendationIds = cachedEntry.ids;
        if (cacheStatus === 'stale') {
            console.log(`[Hybrid-SWR] Revalidando catalogo ${catalogId} in background...`);
            buildRecommendIds().catch(e => console.error('[Hybrid-SWR] Error:', e.message));
        }
    }

    if (!recommendationIds) {
        recommendationIds = await buildRecommendIds();
    }

    if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
        recommendationIds = await fetchPopularFallbackIds(tmdbApiKey, mediaType);
        if (recommendationIds.length > 0) {
            await hybridRecommendationsCache.set(cacheKey, { ids: recommendationIds });
        }
    }

    const pageIds = recommendationIds.slice(skip, skip + ITEMS_PER_PAGE);
    if (pageIds.length === 0) return [];

    // Light Mode: cache-first from local details cache, TMDB fallback only on miss.
    let tmdbClient;
    const results = await rateLimitedMap(
        pageIds,
        async (tmdbId) => {
            try {
                const normalizedId = normalizeContentId(tmdbId);
                const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
                let item = await tmdb.getTmdbMovieDetails(tmdbApiKey, normalizedId, tmdbType, { cacheOnly: true });

                if (!item) {
                    if (!tmdbClient) tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
                    const endpoint = mediaType === 'movie' ? `/movie/${normalizedId}` : `/tv/${normalizedId}`;
                    const res = await tmdbClient.get(endpoint);
                    item = res.data;
                }

                if (!item) return null;
                return {
                    id: `tmdb:${normalizedId}`,
                    type: mediaType === 'movie' ? 'movie' : 'series',
                    name: item.title || item.name || 'Unknown',
                    poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
                    posterShape: 'poster',
                    background: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
                    description: item.overview || '',
                    releaseInfo: (item.release_date || item.first_air_date || '').substring(0, 4),
                    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : undefined,
                    genre_ids: item.genre_ids || (item.genres ? item.genres.map(g => g.id) : [])
                };
            } catch (_e) {
                return null;
            }
        },
        { batchSize: 5, delayMs: 50 }
    );

    // Background Sync: scarica metadati completi per la cache (non bloccante)
    global.setImmediate(() => {
        rateLimitedMap(pageIds, async (tmdbId) => {
            try {
                const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
                await tmdb.getTmdbMovieDetails(tmdbApiKey, tmdbId.toString(), tmdbType);
            } catch (_e) { /* background enrichment failure is non-blocking */ }
        }, { batchSize: 1, delayMs: 600 }).catch(() => { });
    });

    return results.filter(Boolean);
}

/**
 * Sincronizzazione incrementale profilo utente da history Trakt.
 */
async function syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context = 'global') {
    if (!userId || !traktToken || !tmdbApiKey) return false;
    const lockKey = `sync_lock:${userId}:${context}`;
    if (activeSyncLocks.has(lockKey)) {
        return false;
    }
    activeSyncLocks.add(lockKey);
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
    } finally {
        activeSyncLocks.delete(lockKey);
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
    buildHiddenGemsCatalog,
    buildTraktFilteredCatalog,
    twoTierScore,
    resolveAiQueryToTmdbParams,
    saveScoringData,
    recommendationsCache: hybridRecommendationsCache
};
