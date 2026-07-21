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
const { getDuckDbCatalogFromPreset, getDuckDbCatalogFromFilters } = require('../../catalog/providers/DuckDbProvider');
const { F, S } = require('../../data/filters');
const graph = require('../graph/HierarchicalGraph');

function getTopNodeIds(profile, level = 'L2', limit = 2) {
    if (!profile || !profile.compiledVectors || !profile.compiledVectors.V_final) return [];
    return Object.entries(profile.compiledVectors.V_final)
        .filter(([k]) => k.startsWith(`${level}:`))
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([k]) => k.split(':')[1]);
}

function getKeywordsForNodeIds(nodeIds, level = 'L2') {
    if (!graph.isLoaded || !graph.data || !graph.data[level]) return [];
    const kwIds = new Set();
    for (const nodeId of nodeIds) {
        // If the level is L1, the children_L1 is just itself, otherwise it's in the graph
        const l1s = level === 'L1' ? [nodeId] : (graph.data[level][nodeId]?.children_L1 || []);
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
 * Deduplica un array di film mantenendo solo l'elemento con il punteggio (o ordine) più alto per ciascuna collezione.
 * @param {Array} scoredItems Array di film già ordinati per punteggio decrescente.
 * @returns {Array} Array deduplicato.
 */
function deduplicateByCollection(scoredItems) {
    const seenCollections = new Set();
    const result = [];
    
    for (const item of scoredItems) {
        const data = item.data || item.rawTMDB || item;
        const collectionId = data.collection_id || data.belongs_to_collection?.id;
        
        if (collectionId) {
            if (seenCollections.has(collectionId)) {
                continue; // Saga già presente, scarta l'elemento secondario
            }
            seenCollections.add(collectionId);
        }
        
        result.push(item);
    }
    
    return result;
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

const ANIME_KEYWORDS = ['210024', '287501', '290894', '290895', '310214', '288390'];

function getAnimeProportion(profile, directKwIds = [], topGenres = []) {
    const activeSubProfile = profile?.user?.profiles?.find(p => p.id === profile.context);
    const pinnedCatalogs = activeSubProfile?.catalogs || [];
    
    if (pinnedCatalogs.length > 0) {
        const presetsList = getPresets();
        const presetMap = new Map(presetsList.map(p => [`yaca_preset_${p.id}`, p]));
        
        let animeCount = 0;
        for (const cat of pinnedCatalogs) {
            const preset = presetMap.get(cat.id);
            if (cat.isAnime || (preset && preset.isAnime)) {
                animeCount++;
            }
        }
        const ratio = animeCount / pinnedCatalogs.length;
        if (ratio > 0) return ratio;
    }
    
    // Se non ci sono cataloghi pinati (o nessuno è anime), cerchiamo il DNA
    if (topGenres.includes('16') || topGenres.includes(16)) {
        const hasAnimeKw = directKwIds.some(kw => ANIME_KEYWORDS.includes(String(kw)));
        if (hasAnimeKw) return 1.0;
    }
    return 0;
}

/**
 * Esegue query parallele su DuckDB raggruppate per Topos/Keyword ("Smart AND"),
 * applicando la proporzione esatta per forzare (o meno) il flag Anime.
 */
async function fetchSmartAndPool(profile, tmdbApiKey, mediaType, baseFilters = [], limitPerQuery = 50) {
    const types = mediaType === 'movie' ? 'movie' : 'tv';
    
    const { user, context } = profile;
    const globalProfile = null; // not strictly needed for the fetch, used later for scoring

    // 2. Estrazione DNA
    const topGenres = computeTopGenres(profile, 3, user, context);
    const topL2Ids = getTopNodeIds(profile, 'L2', 3);
    let directKwIds = computeTopKeywords(profile, 10, user, context);

    // 1. Calcolo Proporzione Anime
    const animeRatio = getAnimeProportion(profile, directKwIds, topGenres);
    
    // Costruiamo i cluster (Topoi + Keywords)
    const clusters = [];
    
    // Cluster da Topoi L2
    for (const l2Id of topL2Ids) {
        const toposKwIds = getKeywordsForNodeIds([l2Id], 'L2');
        if (toposKwIds.length > 0) {
            clusters.push({ name: `Topos ${l2Id}`, keywords: toposKwIds });
        }
    }
    
    // Se non abbiamo L2 (es. profilo nuovo), usiamo le direct keywords a coppie o singole
    if (clusters.length === 0 && directKwIds.length > 0) {
        for (let i = 0; i < directKwIds.length; i += 2) {
            const pair = [directKwIds[i]];
            if (directKwIds[i+1]) pair.push(directKwIds[i+1]);
            clusters.push({ name: `KwPair ${pair.join(',')}`, keywords: pair });
        }
    }
    
    console.log(`[Smart AND] AnimeRatio: ${animeRatio}, TopGenres: ${topGenres.length}, Clusters: ${clusters.length}`);
    if (clusters.length === 0 && topGenres.length === 0) {
        console.log(`[Smart AND] Nessun cluster o genere, ritorno vuoto`);
        return { pool: [], animeRatio }; 
    }
    
    if (clusters.length === 0) {
        clusters.push({ name: 'Fallback Genres Only', keywords: [] });
    }
    
    let allResultsMap = new Map();
    let totalQueries = clusters.length;
    let animeQueriesLimit = Math.round(totalQueries * animeRatio);
    
    // 3. Esecuzione Parallela Smart AND
    const promises = clusters.map(async (cluster, index) => {
        const where = [...baseFilters];
        
        // Aggiungiamo i top genres in OR (ne basta uno)
        if (topGenres.length > 0) {
            where.push(F.any(...topGenres.map(g => F.genre(Number(g)))));
        }
        
        // Aggiungiamo il cluster di keyword in OR tra loro
        if (cluster.keywords.length > 0) {
            where.push(F.any(...cluster.keywords.map(k => F.keyword(Number(k)))));
        }
        
        // Applichiamo la Quota Anime
        if (index < animeQueriesLimit) {
            where.push(F.anime); // Deve essere strettamente anime
        }
        
        const preset = { type: types, where, orderBy: S.POPULAR };
        console.log(`[Smart AND Query ${index + 1}/${totalQueries}] WHERE:`, JSON.stringify(where));
        try {
            const results = await getDuckDbCatalogFromPreset(preset, 0, limitPerQuery);
            console.log(`[Smart AND Query ${index + 1}/${totalQueries}] Found ${results?.length || 0} items`);
            return results || [];
        } catch(e) {
            console.error(`[Smart AND Query ${index + 1}/${totalQueries}] Error:`, e);
            return [];
        }
    });
    
    const resultsArrays = await Promise.all(promises);
    
    for (const arr of resultsArrays) {
        for (const item of arr) {
            const id = String(item._tmdbId || item.id.split(':')[1]);
            if (!allResultsMap.has(id)) {
                allResultsMap.set(id, item);
            }
        }
    }
    
    return { pool: Array.from(allResultsMap.values()), animeRatio };
}

/**
 * 🎯 Hero Catalog 1: True Blend ("Scelti per Te")
 */
async function buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return fetchPopularFallbackIds(tmdbApiKey, mediaType);

    const catalogId = mediaType === 'movie' ? 'yaca_true_blend_movies' : 'yaca_true_blend_series';
    
    const baseFilters = [F.minVotes(1000)];
    profile.user = user;
    profile.context = context;
    
    const { pool } = await fetchSmartAndPool(profile, tmdbApiKey, mediaType, baseFilters, 1000);
    
    if (pool.length === 0) {
        return fetchPopularFallbackIds(tmdbApiKey, mediaType);
    }
    
    const impressionMap = await getImpressionMap(userId, context, catalogId, pool.map(m => String(m._tmdbId || m.id.split(':')[1])));
    const dnaFilters = getProfileDnaFilters(user, context);
    
    const scored = pool.map(item => {
        const id = String(item._tmdbId || item.id.split(':')[1]);
        const seenDays = impressionMap.get(id) || 0;
        const penaltyMultiplier = calculateImpressionPenalty(seenDays);
        const score = ProfileScorer.calculateItemMatch(item.rawTMDB || item, profile, { dnaFilters, globalProfile });
        return { data: item.rawTMDB || item, score: score * penaltyMultiplier };
    });
    
    const sorted = scored.sort((a, b) => b.score - a.score);
    const deduplicated = mediaType === 'movie' ? deduplicateByCollection(sorted) : sorted;
    
    return deduplicated.slice(0, 100).map(i => ({ 
        id: String(i.data.id), 
        matchScore: Math.min(100, Math.max(1, Math.round(i.score * 10))), 
        rawTMDB: i.data 
    }));
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

    let dnaSeeds = [];
    const topL2Ids = getTopNodeIds(profile, 'L2', 2);
    const directKwIds = computeTopKeywords(profile, 10, user, context);
    
    const where = [];
    if (topGenres.length > 0) {
        where.push(F.any(...topGenres.map(g => F.genre(Number(g)))));
    }
    if (directKwIds.length > 0) {
        where.push(F.keyword(...directKwIds.map(Number)));
    }
    for (const l2Id of topL2Ids) {
        const toposKwIds = getKeywordsForNodeIds([l2Id], 'L2');
        if (toposKwIds.length > 0) {
            where.push(F.keyword(...toposKwIds.map(Number)));
        }
    }
    
    if (where.length > 0) {
        const preset = { type: types, where, orderBy: S.POPULAR };
        console.log(`\n======================================================`);
        console.log(`[Catalog Debug] Seed Network - profile context=${context}`);
        console.log(`[Catalog Debug] DNA Rules:`);
        where.forEach((rule, idx) => console.log(`   ${idx + 1}. ${rule}`));
        console.log(`======================================================\n`);
        const lightMetas = await getDuckDbCatalogFromPreset(preset, 0, 10);
        if (lightMetas && lightMetas.length > 0) {
            dnaSeeds = lightMetas.slice(0, 5).map(item => ({ id: String(item._tmdbId || item.id.split(':')[1]), weight: 4 }));
        }
    }

    const allSeedsMap = new Map();
    [...lovedIds, ...likedIds, ...traktIds, ...dnaSeeds].forEach(({ id, weight }) => {
        allSeedsMap.set(id, (allSeedsMap.get(id) || 0) + weight);
    });

    console.log(`[Catalog Debug] Seed Network - Collected Seeds: Loved=${lovedIds.length}, Liked=${likedIds.length}, Trakt=${traktIds.length}, DNA=${dnaSeeds.length}`);

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

    const sorted = scored.sort((a, b) => (b.score + b.hybridScore) - (a.score + a.hybridScore));
    const deduplicated = mediaType === 'movie' ? deduplicateByCollection(sorted) : sorted;

    return deduplicated.slice(0, 100).map(i => ({ id: String(i.data.id), matchScore: Math.min(100, Math.max(1, Math.round(i.score * 10))) }));
}

/**
 * 💎 Hero Catalog 3: Hidden Gems ("Gemme Nascoste" / Anti-Trash)
 */
async function buildHiddenGemsCatalog(userId, context, tmdbApiKey, mediaType) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return fetchHiddenGemsFallbackIds(tmdbApiKey, mediaType);

    const catalogId = mediaType === 'movie' ? 'yaca_hidden_gems_movies' : 'yaca_hidden_gems_series';
    
    const baseFilters = [
        F.minScore(6.5),
        F.minVotes(50),
        F.maxVotes(1000)
    ];
    if (mediaType === 'movie') {
        baseFilters.push(F.minRuntime(60));
    }
    
    profile.user = user;
    profile.context = context;
    
    const { pool } = await fetchSmartAndPool(profile, tmdbApiKey, mediaType, baseFilters, 1000);
    
    if (pool.length === 0) {
        return fetchHiddenGemsFallbackIds(tmdbApiKey, mediaType);
    }
    
    const impressionMap = await getImpressionMap(userId, context, catalogId, pool.map(m => String(m._tmdbId || m.id.split(':')[1])));
    const dnaFilters = getProfileDnaFilters(user, context);
    
    const scored = pool.map(item => {
        const id = String(item._tmdbId || item.id.split(':')[1]);
        const seenDays = impressionMap.get(id) || 0;
        const penaltyMultiplier = calculateImpressionPenalty(seenDays);
        const score = ProfileScorer.calculateItemMatch(item.rawTMDB || item, profile, { dnaFilters, globalProfile });
        return { data: item.rawTMDB || item, score: score * penaltyMultiplier };
    });
    
    const sorted = scored.sort((a, b) => b.score - a.score);
    const deduplicated = mediaType === 'movie' ? deduplicateByCollection(sorted) : sorted;
    
    return deduplicated.slice(0, 100).map(i => ({ 
        id: String(i.data.id), 
        matchScore: Math.min(100, Math.max(1, Math.round(i.score * 10))), 
        rawTMDB: i.data 
    }));
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

    const sorted = scored.filter(Boolean).sort((a, b) => b.score - a.score);
    const deduplicated = mediaType === 'movie' ? deduplicateByCollection(sorted) : sorted;
    
    return deduplicated
        .slice(0, 100)
        .map(i => ({ id: String(i.data.id), matchScore: Math.min(100, Math.max(1, Math.round(i.score * 10))) }));
}

module.exports = {
    buildDirectPresetCatalog,
    buildTopGenresMixCatalog,
    buildHybridCatalog,
    buildHiddenGemsCatalog,
    buildTraktFilteredCatalog
};
