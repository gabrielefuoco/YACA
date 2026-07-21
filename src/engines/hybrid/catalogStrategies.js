const tmdb = require('../../clients/tmdb');
const { getPresets } = require('../../data/presets');
const { normalizeContentId } = require('../../utils/contentId');
const { getProfileDnaFilters } = require('../../utils/helpers');
const { rateLimitedMap } = require('../../utils/rateLimiter');

// Import from new modules
const { applyKidsMode } = require('../../utils/kidsModeFilters');
const { fetchTmdbResults, fetchProfileContext, fetchTraktRecommendationsRaw, fetchPopularFallbackIds, fetchHiddenGemsFallbackIds, getImpressionMap, calculateImpressionPenalty } = require('./dataFetchers');
const { extractDNAParams, resolveAiQueryToTmdbParams, twoTierScore, computeTopGenres, computeTopKeywords, calculateHybridScore } = require('./scoringEngine');
const ProfileScorer = require('../../profile/ProfileScorer');
const { getDuckDbCatalogFromFilters } = require('../../catalog/providers/DuckDbProvider');
const graph = require('../graph/HierarchicalGraph');

function getTopL2Ids(profile, limit = 2) {
    if (!profile || !profile.compiledVectors || !profile.compiledVectors.V_final) return [];
    return Object.entries(profile.compiledVectors.V_final)
        .filter(([k]) => k.startsWith('L2:'))
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([k]) => k.split(':')[1]);
}

function getKeywordsForL2Ids(l2Ids) {
    if (!graph.isLoaded || !graph.data || !graph.data.L2) return [];
    const kwIds = new Set();
    for (const l2Id of l2Ids) {
        const l1s = graph.data.L2[l2Id]?.children_L1 || [];
        for (const l1 of l1s) {
            for (const [kwId, targetL1] of Object.entries(graph.data.kw_to_L1 || {})) {
                if (targetL1 === l1) kwIds.add(kwId);
            }
        }
    }
    let kwArray = Array.from(kwIds);
    // Limit to max 50 keywords for SQL performance
    if (kwArray.length > 50) {
        kwArray = kwArray.sort(() => 0.5 - Math.random()).slice(0, 50);
    }
    return kwArray;
}

/**
 * 🎯 Direct Preset Catalog Builder (Bug 1.3 Fix: Preset Fall-through)
 */
async function buildDirectPresetCatalog(presetId, userId, context, tmdbApiKey, mediaType) {
    const presetsList = getPresets();
    const preset = presetsList.find(p => p.id === presetId);
    if (!preset || !preset.queries || preset.queries.length === 0) {
        return [];
    }

    const { profile } = await fetchProfileContext(userId, context);
    const isKidsMode = profile?.settings?.kidsMode;

    const tmdbType = (preset.type === 'series' || mediaType === 'series') ? 'tv' : 'movie';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const existingIds = new Set();
    const pool = [];

    for (const query of preset.queries) {
        const params = { ...query };
        delete params.strategy; 

        if (!params.sort_by) params.sort_by = 'popularity.desc';
        const finalParams = isKidsMode ? applyKidsMode(params) : params;

        for (let page = 1; page <= 3; page++) {
            const results = await fetchTmdbResults(
                tmdbClient,
                `/discover/${tmdbType}`,
                { ...finalParams, page },
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

    return pool.slice(0, 100).map(id => ({ id: String(id), matchScore: null }));
}

/**
 * 🎯 Hero Catalog 1: True Blend ("Scelti per Te")
 */
async function buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return fetchPopularFallbackIds(tmdbApiKey, mediaType);

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const catalogId = mediaType === 'movie' ? 'yaca_true_blend_movies' : 'yaca_true_blend_series';
    
    const topL2Ids = getTopL2Ids(profile, 2);
    const kwIds = getKeywordsForL2Ids(topL2Ids);
    
    // Fallback if no L2 Topoi
    if (kwIds.length === 0) {
        return fetchPopularFallbackIds(tmdbApiKey, mediaType);
    }
    
    const dnaFilters = getProfileDnaFilters(user, context);
    const filters = {
        with_keywords: kwIds.join('|'), // OR Query on top L2 keywords
        'vote_count.gte': 1000,         // Scelti per te = blockbuster / popular
        sort_by: 'popularity.desc'
    };
    
    // Use DuckDB for instant local querying
    const lightMetas = await getDuckDbCatalogFromFilters(filters, types, 0, 500, {});
    if (!lightMetas || lightMetas.length === 0) {
        return fetchPopularFallbackIds(tmdbApiKey, mediaType);
    }
    
    const impressionMap = await getImpressionMap(userId, context, catalogId, lightMetas.map(m => String(m._tmdbId)));

    const scored = lightMetas.map(item => {
        const seenDays = impressionMap.get(String(item._tmdbId)) || 0;
        const penaltyMultiplier = calculateImpressionPenalty(seenDays);
        const score = ProfileScorer.calculateItemMatch(item.rawTMDB, profile, { dnaFilters, globalProfile });
        return { data: item.rawTMDB, score: score * penaltyMultiplier };
    });
    
    return scored.sort((a, b) => b.score - a.score).slice(0, 100).map(i => ({ id: String(i.data.id), matchScore: Math.min(100, Math.max(1, Math.round(i.score))) }));
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

    const traktRaw = await fetchTraktRecommendationsRaw(traktToken, mediaType === 'movie' ? 'movies' : 'shows', 10, user);
    const traktIds = traktRaw
        .map(item => ({ id: String(item.movie?.ids?.tmdb || item.show?.ids?.tmdb), weight: 3 }))
        .filter(s => s.id && s.id !== 'undefined');

    const isKidsMode = profile?.settings?.kidsMode;
    const dnaParams = extractDNAParams(dnaFilters);
    const safeDnaParams = isKidsMode ? applyKidsMode(dnaParams) : dnaParams;
    let dnaSeeds = [];
    if (Object.keys(safeDnaParams).length > 0) {
        try {
            const discoverRes = await fetchTmdbResults(tmdbClient, `/discover/${types}`, safeDnaParams, `DNA Discover seeds (${types})`);
            if (discoverRes && discoverRes.length > 0) {
                dnaSeeds = discoverRes.slice(0, 5).map(item => ({ id: String(item.id), weight: 4 }));
            }
        } catch(e) { }
    }

    const allSeedsMap = new Map();
    [...lovedIds, ...likedIds, ...traktIds, ...dnaSeeds].forEach(({ id, weight }) => {
        allSeedsMap.set(id, (allSeedsMap.get(id) || 0) + weight);
    });

    if (allSeedsMap.size === 0) {
        return fetchPopularFallbackIds(tmdbApiKey, mediaType);
    }
    const allSeeds = Array.from(allSeedsMap.entries()).map(([id, weight]) => ({ id, weight }));

    const weightedCounts = new Map(); 
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
        
        let hybridScore = calculateHybridScore(
            { tmdbId, position: null },
            new Map([[tmdbId, weightedScore]]),
            topGenres,
            itemGenres
        );

        // Penalizzazione precoce per garantire il rispetto del DNA prima del taglio ai 80 candidati
        const dnaMultiplier = ProfileScorer.computeDnaMultiplier(rawItem, dnaFilters);
        hybridScore *= dnaMultiplier;

        candidates.push({ data: rawItem, hybridScore });
    }

    candidates.sort((a, b) => b.hybridScore - a.hybridScore);

    const candidateIds = candidates.slice(0, 80).map(c => String(c.data.id));
    const catalogId = mediaType === 'movie' ? 'yaca_seed_network_movies' : 'yaca_seed_network_series';
    const impressionMap = await getImpressionMap(userId, context, catalogId, candidateIds);

    const scored = await rateLimitedMap(
        candidates.slice(0, 80),
        async ({ data, hybridScore }) => {
            const seenDays = impressionMap.get(String(data.id)) || 0;
            const penaltyMultiplier = calculateImpressionPenalty(seenDays);

            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, data.id, types);
            const score = ProfileScorer.calculateItemMatch(details, profile, { dnaFilters, globalProfile });
            return { data, score: score * penaltyMultiplier, hybridScore: hybridScore * penaltyMultiplier };
        },
        { batchSize: 3, delayMs: 150 }
    );

    return scored.sort((a, b) => (b.score + b.hybridScore) - (a.score + a.hybridScore)).slice(0, 100).map(i => ({ id: String(i.data.id), matchScore: Math.min(100, Math.max(1, Math.round(i.score))) }));
}

/**
 * 💎 Hero Catalog 3: Hidden Gems ("Gemme Nascoste" / Anti-Trash)
 */
async function buildHiddenGemsCatalog(userId, context, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return fetchHiddenGemsFallbackIds(tmdbApiKey, mediaType);

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const catalogId = mediaType === 'movie' ? 'yaca_hidden_gems_movies' : 'yaca_hidden_gems_series';
    
    const topL2Ids = getTopL2Ids(profile, 2);
    const kwIds = getKeywordsForL2Ids(topL2Ids);
    
    if (kwIds.length === 0) {
        return fetchHiddenGemsFallbackIds(tmdbApiKey, mediaType);
    }

    const dnaFilters = getProfileDnaFilters(user, context);
    const filters = {
        with_keywords: kwIds.join('|'),
        'vote_average.gte': 6.5,
        'vote_count.gte': 50,
        'vote_count.lte': 1000,         // Hidden gems = low popularity
        sort_by: 'popularity.desc'
    };
    
    if (types === 'movie') filters['with_runtime.gte'] = 60; 

    // Use DuckDB for instant local querying
    const lightMetas = await getDuckDbCatalogFromFilters(filters, types, 0, 500, {});
    if (!lightMetas || lightMetas.length === 0) {
        return fetchHiddenGemsFallbackIds(tmdbApiKey, mediaType);
    }
    
    const impressionMap = await getImpressionMap(userId, context, catalogId, lightMetas.map(m => String(m._tmdbId)));

    const scored = lightMetas.map(item => {
        const seenDays = impressionMap.get(String(item._tmdbId)) || 0;
        const penaltyMultiplier = calculateImpressionPenalty(seenDays);
        const score = ProfileScorer.calculateItemMatch(item.rawTMDB, profile, { dnaFilters, globalProfile });
        return { data: item.rawTMDB, score: score * penaltyMultiplier };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, 100).map(i => ({ id: String(i.data.id), matchScore: Math.min(100, Math.max(1, Math.round(i.score))) }));
}

/**
 * 🌐 Hero Catalog 4: Trakt Filtered ("Suggeriti dalla Community")
 */
async function buildTraktFilteredCatalog(userId, context, traktToken, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    // console.log(`[TraktFiltered] userId=${userId}, context=${context}, hasProfile=${!!profile}, hasUser=${!!user}, hasTraktToken=${!!traktToken}, tokenFirst10=${traktToken?.substring(0,10)}`);
    if (!profile) return fetchPopularFallbackIds(tmdbApiKey, mediaType);

    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const dnaFilters = getProfileDnaFilters(user, context);

    const traktRaw = await fetchTraktRecommendationsRaw(traktToken, mediaType === 'movie' ? 'movies' : 'shows', 100, user);
    const traktTmdbIds = traktRaw
        .map(item => item.movie?.ids?.tmdb || item.show?.ids?.tmdb || item.ids?.tmdb)
        .filter(Boolean);

    // console.log(`[TraktFiltered] traktTmdbIds count: ${traktTmdbIds.length}`);

    if (traktTmdbIds.length === 0) return [];

    const candidateIds = traktTmdbIds.slice(0, 100).map(String);
    const catalogId = mediaType === 'movie' ? 'yaca_trakt_filtered_movies' : 'yaca_trakt_filtered_series';
    const impressionMap = await getImpressionMap(userId, context, catalogId, candidateIds);

    const scored = await rateLimitedMap(
        traktTmdbIds.slice(0, 100),
        async (id) => {
            const seenDays = impressionMap.get(String(id)) || 0;
            const penaltyMultiplier = calculateImpressionPenalty(seenDays);

            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, id, types);
            if (!details) return null;
            const score = ProfileScorer.calculateItemMatch(details, profile, { dnaFilters, globalProfile });
            return { data: details, score: score * penaltyMultiplier };
        },
        { batchSize: 3, delayMs: 150 }
    );

    return scored
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 100)
        .map(i => ({ id: String(i.data.id), matchScore: Math.min(100, Math.max(1, Math.round(i.score))) }));
}

module.exports = {
    buildDirectPresetCatalog,
    buildTopGenresMixCatalog,
    buildHybridCatalog,
    buildHiddenGemsCatalog,
    buildTraktFilteredCatalog
};
