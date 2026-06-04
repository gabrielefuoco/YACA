const tmdb = require('../../clients/tmdb');
const { getPresets } = require('../../data/presets');
const { generateDiscoveryQueries } = require('../../ai/querySynthesizer');
const { normalizeContentId } = require('../../utils/contentId');
const { getProfileDnaFilters } = require('../../utils/helpers');
const { rateLimitedMap } = require('../../utils/rateLimiter');

// Import from new modules
const { fetchTmdbResults, fetchProfileContext, fetchTraktRecommendationsRaw, fetchPopularFallbackIds, fetchHiddenGemsFallbackIds } = require('./dataFetchers');
const { extractDNAParams, resolveAiQueryToTmdbParams, twoTierScore, computeTopGenres, computeTopKeywords, calculateHybridScore } = require('./scoringEngine');
const ProfileScorer = require('../../profile/ProfileScorer');

/**
 * 🎯 Direct Preset Catalog Builder (Bug 1.3 Fix: Preset Fall-through)
 */
async function buildDirectPresetCatalog(presetId, tmdbApiKey, mediaType) {
    const presetsList = getPresets();
    const preset = presetsList.find(p => p.id === presetId);
    if (!preset || !preset.queries || preset.queries.length === 0) {
        return [];
    }

    const tmdbType = (preset.type === 'series' || mediaType === 'series') ? 'tv' : 'movie';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const existingIds = new Set();
    const pool = [];

    for (const query of preset.queries) {
        const params = { ...query };
        delete params.strategy; 

        if (!params.sort_by) params.sort_by = 'popularity.desc';

        for (let page = 1; page <= 3; page++) {
            const results = await fetchTmdbResults(
                tmdbClient,
                `/discover/${tmdbType}`,
                { ...params, page },
                `Direct Preset (${presetId}) page ${page}`
            );
            for (const item of results) {
                const nId = normalizeContentId(item.id);
                if (nId && !existingIds.has(nId)) {
                    existingIds.add(nId);
                    pool.push(nId);
                }
            }
        }
    }

    return pool.slice(0, 100);
}

/**
 * 🎯 Hero Catalog 1: True Blend ("Scelti per Te")
 */
async function buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return fetchPopularFallbackIds(tmdbApiKey, mediaType);

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const dnaFilters = getProfileDnaFilters(user, context);
    const dnaParams = extractDNAParams(dnaFilters);

    const topGenres = computeTopGenres(profile, 5, user, context);
    const topKeywords = computeTopKeywords(profile, 5, user, context);

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

    const mistralKey = user?.apiKeys?.mistral;
    let aiQueries = [];
    if (mistralKey) {
        try {
            aiQueries = await generateDiscoveryQueries(profile, mistralKey, 'trueBlend', user, context);
        } catch (_e) { }
    }

    if (aiQueries.length > 0) {
        const queryPromises = aiQueries.map(async (q) => {
            const tmdbParams = await resolveAiQueryToTmdbParams(q, tmdbApiKey, types);
            return fetchDiscoverPages({ ...dnaParams, ...tmdbParams }, 3);
        });
        const allResults = await Promise.all(queryPromises);
        allResults.forEach(results => addResults(results));
    } else {
        const discoveryParams = { ...dnaParams };
        if (topGenres.length) discoveryParams.with_genres = topGenres.join('|');
        if (topKeywords.length) discoveryParams.with_keywords = topKeywords.join('|');
        addResults(await fetchDiscoverPages(discoveryParams, 3));
    }

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

    const scored = await twoTierScore(pool, profile, { tmdbApiKey, types, dnaFilters, globalProfile });

    const genreCounts = new Map();
    const jittered = scored.map(item => {
        const genres = item.data.genre_ids || [];
        let penalty = 0;
        for (const g of genres) {
            const count = genreCounts.get(g) || 0;
            if (count > 5) penalty += 0.15 * (count - 5);
            genreCounts.set(g, count + 1);
        }
        const jitter = (Math.random() - 0.5) * 0.3;
        return { ...item, score: item.score + jitter - penalty };
    });

    return jittered.sort((a, b) => b.score - a.score).slice(0, 100).map(i => String(i.data.id));
}

/**
 * 🕸️ Hero Catalog 2: Super-Seed Network ("La Rete dei tuoi Preferiti")
 */
async function buildHybridCatalog(userId, context, traktToken, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return fetchPopularFallbackIds(tmdbApiKey, mediaType);

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const dnaFilters = getProfileDnaFilters(user, context);

    const topGenres = computeTopGenres(profile, 3, user, context);

    const lovedIds = (user?.profiles?.find(p => p.id === context)?.loved || []).slice(0, 20).map(id => ({ id: String(id), weight: 2 }));
    const likedIds = (user?.profiles?.find(p => p.id === context)?.liked || []).slice(0, 15).map(id => ({ id: String(id), weight: 1 }));

    const traktRaw = await fetchTraktRecommendationsRaw(traktToken, mediaType === 'movie' ? 'movies' : 'shows', 10);
    const traktIds = traktRaw
        .map(item => ({ id: String(item.movie?.ids?.tmdb || item.show?.ids?.tmdb), weight: 3 }))
        .filter(s => s.id && s.id !== 'undefined');

    const allSeeds = [...traktIds, ...lovedIds, ...likedIds];
    if (allSeeds.length === 0) return fetchPopularFallbackIds(tmdbApiKey, mediaType);

    const weightedCounts = new Map(); 
    const seedTmdbIds = allSeeds.map(s => s.id);

    const allSimilar = await rateLimitedMap(
        allSeeds,
        async (seed) => ({
            results: await fetchTmdbResults(tmdbClient, `/${types}/${seed.id}/recommendations`, {}, `Hybrid recommendations (${types}/${seed.id})`),
            weight: seed.weight
        }),
        { batchSize: 5, delayMs: 50 }
    );
    const itemData = new Map(); 

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

    const scored = await rateLimitedMap(
        candidates.slice(0, 80),
        async ({ data, hybridScore }) => {
            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, data.id, types);
            const score = ProfileScorer.calculateItemMatch(details, profile, { dnaFilters, globalProfile });
            return { data, score, hybridScore };
        },
        { batchSize: 5, delayMs: 50 }
    );

    return scored.sort((a, b) => (b.score + b.hybridScore) - (a.score + a.hybridScore)).slice(0, 100).map(i => String(i.data.id));
}

/**
 * 💎 Hero Catalog 3: Hidden Gems ("Gemme Nascoste" / Anti-Trash)
 */
async function buildHiddenGemsCatalog(userId, context, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return fetchHiddenGemsFallbackIds(tmdbApiKey, mediaType);

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const dnaFilters = getProfileDnaFilters(user, context);
    const dnaParams = extractDNAParams(dnaFilters);

    const topGenres = computeTopGenres(profile, 3);

    const qualityFilters = {
        sort_by: 'vote_average.desc',
        'vote_count.gte': 100,
        'vote_count.lte': 3000,
        'vote_average.gte': 7.0,
        'popularity.lte': 80 
    };
    if (types === 'movie') qualityFilters['with_runtime.gte'] = 60; 

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

    const mistralKey = user?.apiKeys?.mistral;
    let aiQueries = [];
    if (mistralKey) {
        try {
            aiQueries = await generateDiscoveryQueries(profile, mistralKey, 'hiddenGems', user, context);
        } catch (_e) { }
    }

    if (aiQueries.length > 0) {
        const queryPromises = aiQueries.map(async (q) => {
            const tmdbParams = await resolveAiQueryToTmdbParams(q, tmdbApiKey, types);
            return fetchDiscoverPages({ ...dnaParams, ...tmdbParams, ...qualityFilters }, 2);
        });
        const allResults = await Promise.all(queryPromises);
        allResults.forEach(results => addResults(results));
    } else {
        const params = { ...dnaParams, ...qualityFilters };
        if (topGenres.length) params.with_genres = topGenres.join('|');
        addResults(await fetchDiscoverPages(params, 2));
    }

    pool = pool.filter(item => item.popularity == null || item.popularity <= 80);

    const scored = await twoTierScore(pool, profile, { tmdbApiKey, types, dnaFilters, globalProfile, catalogContext: 'hidden_gems' });

    return scored.slice(0, 100).map(i => String(i.data.id));
}

/**
 * 🌐 Hero Catalog 4: Trakt Filtered ("Suggeriti dalla Community")
 */
async function buildTraktFilteredCatalog(userId, context, traktToken, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return fetchPopularFallbackIds(tmdbApiKey, mediaType);

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const dnaFilters = getProfileDnaFilters(user, context);

    const traktRaw = await fetchTraktRecommendationsRaw(traktToken, mediaType === 'movie' ? 'movies' : 'shows', 100);
    const traktTmdbIds = traktRaw
        .map(item => item.movie?.ids?.tmdb || item.show?.ids?.tmdb)
        .filter(Boolean);

    if (traktTmdbIds.length === 0) return [];

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

module.exports = {
    buildDirectPresetCatalog,
    buildTopGenresMixCatalog,
    buildHybridCatalog,
    buildHiddenGemsCatalog,
    buildTraktFilteredCatalog
};
