const tmdb = require('../../clients/tmdb');
const { getPresets } = require('../../data/presets');
const { normalizeContentId } = require('../../utils/contentId');
const { getProfileDnaFilters } = require('../../utils/helpers');
const { rateLimitedMap } = require('../../utils/rateLimiter');

// Import from new modules
const { applyKidsMode, isItemInappropriateForKids, ADULT_GENRE_IDS, ADULT_KEYWORD_IDS } = require('../../utils/kidsModeFilters');
const {
    fetchProfileContext,
    fetchTraktRecommendationsRaw,
    fetchTraktRecommendationsRawDetailed,
    fetchPopularFallbackIds,
    fetchTopRatedPeriodFallbackIds,
    fetchUndiscoveredFallbackIds,
    fetchHiddenGemsFallbackIds,
    getImpressionMap,
    calculateImpressionPenalty
} = require('./dataFetchers');
const { computeTopGenres, computeTopKeywords, calculateHybridScore } = require('./scoringEngine');
const ProfileScorer = require('../../profile/ProfileScorer');
const { getDuckDbCatalogFromPreset } = require('../../catalog/providers/DuckDbProvider');
const { F, S, G } = require('../../data/filters');
const graph = require('../graph/HierarchicalGraph');

function mapGenreIdsToTarget(genres) {
    return [...new Set((genres || []).flatMap(genre => {
        const id = Number(genre);
        if (!Number.isFinite(id)) return [];
        return [id, ...G.getEquivalentGenreIds(id)];
    }))];
}

function getTopNodeIds(profile, level = 'L2', limit = 2) {
    if (!profile || !profile.compiledVectors || !profile.compiledVectors.V_final) return [];
    return Object.entries(profile.compiledVectors.V_final)
        .filter(([k]) => k.startsWith(`${level}:`))
        .sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])))
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
    // BUG-DNA-1: Ordinamento deterministico stabile (per id crescente) anziché shuffle casuale
    // con Math.random(), mantenendo il cap a 50 per garantire riproducibilità tra richieste e performance SQL DuckDB.
    if (kwArray.length > 50) {
        kwArray.sort((a, b) => {
            const numA = Number(a);
            const numB = Number(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return String(a).localeCompare(String(b));
        });
        kwArray = kwArray.slice(0, 50);
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

function compareContentIds(a, b) {
    const idA = normalizeContentId(a ?? '');
    const idB = normalizeContentId(b ?? '');
    const numA = Number(idA);
    const numB = Number(idB);
    if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB;
    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
}

function sortScoredByScore(items, scoreSelector) {
    return items.sort((a, b) => {
        const scoreA = Number(scoreSelector(a));
        const scoreB = Number(scoreSelector(b));
        if (Number.isFinite(scoreA) && Number.isFinite(scoreB) && scoreA !== scoreB) return scoreB - scoreA;
        return compareContentIds(a.data?.id, b.data?.id);
    });
}

async function fetchSeedFallbackIds(tmdbApiKey, mediaType, limit, isKidsMode) {
    // L'adapter mantiene compatibili i mock legacy dei test; in produzione usa sempre il fallback dedicato.
    const fetcher = typeof fetchTopRatedPeriodFallbackIds === 'function'
        ? fetchTopRatedPeriodFallbackIds
        : fetchPopularFallbackIds;
    return fetcher(tmdbApiKey, mediaType, limit, isKidsMode);
}

async function fetchCommunityFallbackIds(tmdbApiKey, mediaType, limit, isKidsMode) {
    const fetcher = typeof fetchUndiscoveredFallbackIds === 'function'
        ? fetchUndiscoveredFallbackIds
        : fetchPopularFallbackIds;
    return fetcher(tmdbApiKey, mediaType, limit, isKidsMode);
}

async function fetchTraktRecommendationResult(traktToken, mediaType, limit, user, providedResult = null) {
    if (providedResult && Array.isArray(providedResult.items)) {
        return {
            items: providedResult.items,
            available: providedResult.available === true && providedResult.items.length > 0,
            reason: providedResult.reason || (providedResult.items.length > 0 ? 'ok' : 'empty')
        };
    }
    if (typeof fetchTraktRecommendationsRawDetailed === 'function') {
        const result = await fetchTraktRecommendationsRawDetailed(traktToken, mediaType, limit, user);
        const items = Array.isArray(result) ? result : (Array.isArray(result?.items) ? result.items : []);
        return {
            items,
            available: (Array.isArray(result) || result?.available === true) && items.length > 0,
            reason: result?.reason || (items.length > 0 ? 'ok' : 'empty')
        };
    }
    const items = await fetchTraktRecommendationsRaw(traktToken, mediaType, limit, user);
    const normalizedItems = Array.isArray(items) ? items : [];
    return { items: normalizedItems, available: normalizedItems.length > 0, reason: normalizedItems.length > 0 ? 'ok' : 'empty' };
}

/**
 * 🎯 Direct Preset Catalog Builder (Bug 1.3 Fix: Preset Fall-through)
 */
async function buildDirectPresetCatalog(presetId, userId, context, tmdbApiKey, mediaType, isKidsMode = false) {
    const presetsList = getPresets();
    const preset = presetsList.find(p => p.id === presetId);
    if (!preset || !preset.queries || preset.queries.length === 0) {
        return [];
    }

    const { getDuckDbCatalogFromFilters } = require('../../catalog/providers/DuckDbProvider');
    const tmdbType = (preset.type === 'series' || mediaType === 'series') ? 'series' : 'movie';
    const existingIds = new Set();
    const pool = [];

    for (const query of preset.queries) {
        const params = { ...query };
        delete params.strategy; 

        if (!params.sort_by) params.sort_by = 'popularity.desc';
        const finalParams = isKidsMode ? applyKidsMode(params) : params;

        for (let page = 1; page <= 3; page++) {
            const skip = (page - 1) * 40;
            const results = await getDuckDbCatalogFromFilters(
                finalParams,
                tmdbType,
                skip,
                40,
                {}
            ).catch(() => []);
            for (const item of results) {
                if (isKidsMode && isItemInappropriateForKids(item)) continue;
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

const ANIME_KEYWORDS = ['anime', 'manga', 'shounen', 'shoujo', 'seinen', 'isekai', 'mecha', 'magical girl'];

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
    const hasAnimeGenre = topGenres.some(g => String(g) === '16' || String(g).toLowerCase().includes('animaz') || String(g).toLowerCase().includes('animation'));
    if (hasAnimeGenre) {
        const hasAnimeKw = directKwIds.some(kw => ANIME_KEYWORDS.includes(String(kw).toLowerCase()));
        if (hasAnimeKw) return 1.0;
    }
    return 0;
}

/**
 * Esegue query parallele su DuckDB raggruppate per Topos/Keyword ("Smart AND"),
 * applicando la proporzione esatta per forzare (o meno) il flag Anime.
 */
async function fetchSmartAndPool(profile, tmdbApiKey, mediaType, baseFilters = [], limitPerQuery = 50, isKidsMode = false) {
    const types = mediaType === 'movie' ? 'movie' : 'series';
    
    const { user, context } = profile;
    const globalProfile = null; // not strictly needed for the fetch, used later for scoring

    // 2. Estrazione DNA
    const topGenres = computeTopGenres(profile, 3, user, context);
    const mappedTopGenres = mapGenreIdsToTarget(topGenres);
    const topL2Ids = getTopNodeIds(profile, 'L2', 3);
    let directKwIds = computeTopKeywords(profile, 10, user, context);

    // 1. Calcolo Proporzione Anime
    const animeRatio = getAnimeProportion(profile, directKwIds, mappedTopGenres);
    
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
    
    console.log(`[Smart AND] AnimeRatio: ${animeRatio}, TopGenres: ${mappedTopGenres.length}, Clusters: ${clusters.length}`);
    if (clusters.length === 0 && mappedTopGenres.length === 0) {
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
        if (isKidsMode) {
            where.push(F.notGenre(...ADULT_GENRE_IDS.split(',').map(Number)));
            where.push(F.notKeyword(...ADULT_KEYWORD_IDS.split(',').map(Number)));
        }
        
        // Aggiungiamo i top genres in OR (ne basta uno)
        if (mappedTopGenres.length > 0) {
            where.push(F.any(...mappedTopGenres.map(g => F.genre(Number(g)))));
        }
        
        // Aggiungiamo il cluster di keyword in OR tra loro
        if (cluster.keywords.length > 0) {
            where.push(F.any(...cluster.keywords.map(k => F.keywordStr(k))));
        }
        
        // Applichiamo la Quota Anime
        if (index < animeQueriesLimit) {
            where.push(F.anime); // Deve essere strettamente anime
        }
        
        const preset = { type: types, where, orderBy: S.POPULAR };
        console.log(`[Smart AND Query ${index + 1}/${totalQueries}] WHERE:`, JSON.stringify(where));
        try {
            let results = await getDuckDbCatalogFromPreset(preset, 0, limitPerQuery);
            console.log(`[Smart AND Query ${index + 1}/${totalQueries}] Found ${results?.length || 0} items`);
            
            // Smart Fallback: se una query restituisce meno di 5 risultati (es. keyword iper-specifiche prive di match per Anime),
            // allentiamo il filtro rimuovendo le keyword e tenendo i Generi Top + Quota Anime.
            if ((!results || results.length < 5) && cluster.keywords.length > 0) {
                const fallbackWhere = where.filter(w => !cluster.keywords.some(k => w.includes(String(k))));
                const fallbackPreset = { type: types, where: fallbackWhere, orderBy: S.POPULAR };
                const fallbackResults = await getDuckDbCatalogFromPreset(fallbackPreset, 0, limitPerQuery);
                console.log(`[Smart AND Query ${index + 1}/${totalQueries}] Smart Fallback (Genres/Anime) Found ${fallbackResults?.length || 0} items`);
                results = [...(results || []), ...(fallbackResults || [])];
            }

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
    
    let finalPool = Array.from(allResultsMap.values());
    if (isKidsMode) {
        finalPool = applyKidsMode(finalPool);
    }
    return { pool: finalPool, animeRatio };
}

async function buildFilteredCatalog(userId, context, tmdbApiKey, mediaType, catalogId, baseFilters, fallbackFn, isKidsMode = false) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return fallbackFn(tmdbApiKey, mediaType, 160, isKidsMode);
    
    profile.user = user;
    profile.context = context;
    
    const { pool } = await fetchSmartAndPool(profile, tmdbApiKey, mediaType, baseFilters, 1000, isKidsMode);
    let candidatePool = pool;
    if (isKidsMode) {
        candidatePool = applyKidsMode(pool);
    }
    
    if (candidatePool.length === 0) {
        return fallbackFn(tmdbApiKey, mediaType, 160, isKidsMode);
    }
    
    const impressionMap = await getImpressionMap(userId, context, catalogId, candidatePool.map(m => String(m._tmdbId || m.id.split(':')[1])));
    const dnaFilters = getProfileDnaFilters(user, context);
    
    const scored = candidatePool.map(item => {
        const id = String(item._tmdbId || item.id.split(':')[1]);
        const seenDays = impressionMap.get(id) || 0;
        const penaltyMultiplier = calculateImpressionPenalty(seenDays);
        const tmdbData = item.rawTMDB || item;
        if (isKidsMode && isItemInappropriateForKids(tmdbData)) return null;
        if (typeof tmdbData.vote_count !== 'number') {
            tmdbData.vote_count = typeof item.vote_count === 'number' ? item.vote_count : 0;
        }
        if (!tmdbData.keywords) {
            tmdbData.keywords = item.keywords ? { results: item.keywords, keywords: item.keywords } : { results: [], keywords: [] };
        }
        if (!tmdbData.credits) {
            tmdbData.credits = item.credits || { cast: [], crew: [] };
        }
        const score = ProfileScorer.calculateItemMatch(tmdbData, profile, { dnaFilters, globalProfile, kidsMode: isKidsMode });
        if (isKidsMode && score <= 0) return null;
        return { data: tmdbData, score: score * penaltyMultiplier };
    }).filter(Boolean);
    
    const sorted = sortScoredByScore(scored, item => item.score);
    const deduplicated = mediaType === 'movie' ? deduplicateByCollection(sorted) : sorted;
    const diversified = typeof ProfileScorer.applyDiversityCaps === 'function'
        ? ProfileScorer.applyDiversityCaps(deduplicated, { genre: 3, director: 1 })
        : deduplicated;
    const diversifiedSet = new Set(diversified);
    const remaining = deduplicated.filter(item => !diversifiedSet.has(item));
    let finalItems = [...diversified, ...remaining];
    if (isKidsMode) {
        finalItems = applyKidsMode(finalItems);
    }
    
    if (finalItems.length === 0) {
        return fallbackFn(tmdbApiKey, mediaType, 160, isKidsMode);
    }
    
    return finalItems.slice(0, 100).map(i => ({ 
        id: String(i.data.id), 
        matchScore: Math.min(100, Math.max(1, Math.round(i.score * 10))),
        genres: i.data.genres
    }));
}

/**
 * 🎯 Hero Catalog 1: True Blend ("Scelti per Te")
 */
async function buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType, isKidsMode = false) {
    const catalogId = mediaType === 'movie' ? 'yaca_true_blend_movies' : 'yaca_true_blend_series';
    const baseFilters = [F.minVotes(1000)];
    return buildFilteredCatalog(userId, context, tmdbApiKey, mediaType, catalogId, baseFilters, fetchPopularFallbackIds, isKidsMode);
}

/**
 * 🕸️ Hero Catalog 2: Super-Seed Network ("La Rete dei tuoi Preferiti")
 */
async function buildHybridCatalog(userId, context, traktToken, tmdbApiKey, mediaType, isKidsMode = false, providedTraktResult = null) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return fetchSeedFallbackIds(tmdbApiKey, mediaType, 160, isKidsMode);

    const types = mediaType === 'movie' ? 'movie' : 'series';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const dnaFilters = getProfileDnaFilters(user, context);

    const topGenres = computeTopGenres(profile, 3, user, context);
    const mappedTopGenres = mapGenreIdsToTarget(topGenres);

    const lovedIds = (user?.profiles?.find(p => p.id === context)?.loved || []).slice(0, 20).map(id => ({ id: String(id), weight: 2 }));
    const likedIds = (user?.profiles?.find(p => p.id === context)?.liked || []).slice(0, 15).map(id => ({ id: String(id), weight: 1 }));

    const sharedTraktResult = await fetchTraktRecommendationResult(
        traktToken,
        mediaType === 'movie' ? 'movies' : 'shows',
        10,
        user,
        providedTraktResult
    );
    const traktIds = sharedTraktResult.items
        .slice(0, 10)
        .map(item => ({ id: String(item.movie?.ids?.tmdb || item.show?.ids?.tmdb), weight: 3 }))
        .filter(s => s.id && s.id !== 'undefined');

    let dnaSeeds = [];
    const topL2Ids = getTopNodeIds(profile, 'L2', 2);
    const directKwIds = computeTopKeywords(profile, 10, user, context);
    
    const where = [];
    if (isKidsMode) {
        where.push(F.notGenre(...ADULT_GENRE_IDS.split(',').map(Number)));
        where.push(F.notKeyword(...ADULT_KEYWORD_IDS.split(',').map(Number)));
    }
    if (mappedTopGenres.length > 0) {
        where.push(F.any(...mappedTopGenres.map(g => F.genre(Number(g)))));
    }
    const allKwRules = [];
    if (directKwIds.length > 0) {
        allKwRules.push(...directKwIds.map(k => F.keywordStr(k)));
    }
    for (const l2Id of topL2Ids) {
        const toposKwIds = getKeywordsForNodeIds([l2Id], 'L2');
        if (toposKwIds.length > 0) {
            allKwRules.push(...toposKwIds.map(k => F.keywordStr(k)));
        }
    }
    if (allKwRules.length > 0) {
        where.push(F.any(...allKwRules));
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
        return fetchSeedFallbackIds(tmdbApiKey, mediaType, 160, isKidsMode);
    }
    const allSeeds = Array.from(allSeedsMap.entries()).map(([id, weight]) => ({ id, weight }));

    const { getDuckDbCatalogFromFilters } = require('../../catalog/providers/DuckDbProvider');
    const weightedCounts = new Map(); 
    const allSimilar = await rateLimitedMap(
        allSeeds,
        async (seed) => ({
            results: await getDuckDbCatalogFromFilters({ similar_to: seed.id }, types, 0, 40, { kidsMode: isKidsMode }).catch(() => []),
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
        if (isKidsMode && isItemInappropriateForKids(rawItem)) continue;
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

    candidates.sort((a, b) => {
        const scoreA = Number(a.hybridScore);
        const scoreB = Number(b.hybridScore);
        if (Number.isFinite(scoreA) && Number.isFinite(scoreB) && scoreA !== scoreB) return scoreB - scoreA;
        return compareContentIds(a.data?.id, b.data?.id);
    });

    let filteredCandidates = candidates;
    if (isKidsMode) {
        filteredCandidates = applyKidsMode(candidates);
    }

    const candidateIds = filteredCandidates.slice(0, 80).map(c => String(c.data.id));
    const catalogId = mediaType === 'movie' ? 'yaca_seed_network_movies' : 'yaca_seed_network_series';
    const impressionMap = await getImpressionMap(userId, context, catalogId, candidateIds);

    const scored = await rateLimitedMap(
        filteredCandidates.slice(0, 80),
        async ({ data, hybridScore }) => {
            const seenDays = impressionMap.get(String(data.id)) || 0;
            const penaltyMultiplier = calculateImpressionPenalty(seenDays);

            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, data.id, types);
            const tmdbData = details || data.rawTMDB || data;
            if (isKidsMode && isItemInappropriateForKids(tmdbData)) return null;
            if (typeof tmdbData.vote_count !== 'number') {
                tmdbData.vote_count = typeof data.vote_count === 'number' ? data.vote_count : (data.rawTMDB?.vote_count ?? 0);
            }
            if (!tmdbData.keywords) {
                tmdbData.keywords = data.keywords || data.rawTMDB?.keywords;
            }
            if (!tmdbData.credits) {
                tmdbData.credits = data.credits || data.rawTMDB?.credits;
            }
            const score = ProfileScorer.calculateItemMatch(tmdbData, profile, { dnaFilters, globalProfile, kidsMode: isKidsMode });
            if (isKidsMode && score <= 0) return null;
            const hydratedData = { ...data, ...tmdbData, id: data.id || tmdbData.id };
            return { data: hydratedData, score: score * penaltyMultiplier, hybridScore: hybridScore * penaltyMultiplier };
        },
        { batchSize: 3, delayMs: 150 }
    );

    const validScored = scored.filter(Boolean);

    // H6: Normalizzazione hybridScore su scala 0-10 per renderlo comparabile con lo score VSM (0-10)
    const maxHybrid = validScored.reduce((max, item) => Math.max(max, item.hybridScore || 0), 0);
    const hybridScale = Math.max(maxHybrid, 13.5);

    const scoredWithCombined = validScored.map(item => {
        const normalizedHybrid = hybridScale > 0
            ? Math.min(10, Math.max(0, (item.hybridScore / hybridScale) * 10))
            : 0;
        // Ponderazione VSM-first: VSM (60%) + Ibrido (40%) su scala comune 0-10
        const combinedScore = (item.score * 0.6) + (normalizedHybrid * 0.4);
        return {
            ...item,
            normalizedHybrid,
            combinedScore
        };
    });

    const sorted = sortScoredByScore(scoredWithCombined, item => item.combinedScore);
    const deduplicated = mediaType === 'movie' ? deduplicateByCollection(sorted) : sorted;
    const diversified = typeof ProfileScorer.applyDiversityCaps === 'function'
        ? ProfileScorer.applyDiversityCaps(deduplicated, { genre: 3, director: 1 })
        : deduplicated;
    const diversifiedSet = new Set(diversified);
    const remaining = deduplicated.filter(item => !diversifiedSet.has(item));
    let finalItems = [...diversified, ...remaining];
    if (isKidsMode) {
        finalItems = applyKidsMode(finalItems);
    }

    if (finalItems.length === 0) {
        return fetchSeedFallbackIds(tmdbApiKey, mediaType, 160, isKidsMode);
    }

    return finalItems.slice(0, 100).map(i => ({ id: String(i.data.id), matchScore: Math.min(100, Math.max(1, Math.round(i.score * 10))) }));
}

/**
 * 💎 Hero Catalog 3: Hidden Gems ("Gemme Nascoste" / Anti-Trash)
 */
async function buildHiddenGemsCatalog(userId, context, tmdbApiKey, mediaType, isKidsMode = false) {
    const catalogId = mediaType === 'movie' ? 'yaca_hidden_gems_movies' : 'yaca_hidden_gems_series';
    const baseFilters = [F.minScore(6.5), F.minVotes(50), F.maxVotes(1000)];
    if (mediaType === 'movie') baseFilters.push(F.minRuntime(60));
    
    return buildFilteredCatalog(userId, context, tmdbApiKey, mediaType, catalogId, baseFilters, fetchHiddenGemsFallbackIds, isKidsMode);
}

/**
 * 🌐 Hero Catalog 4: Trakt Filtered ("Suggeriti dalla Community")
 */
async function buildTraktFilteredCatalogWithMeta(userId, context, traktToken, tmdbApiKey, mediaType, isKidsMode = false, providedTraktResult = null) {
    const buildFallback = async (traktAvailable = false) => ({
        ids: await fetchCommunityFallbackIds(tmdbApiKey, mediaType, 160, isKidsMode),
        traktAvailable,
        fallbackUsed: true
    });

    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    if (!profile) return buildFallback(false);

    const types = mediaType === 'movie' ? 'movie' : 'series';
    const dnaFilters = getProfileDnaFilters(user, context);
    const traktResult = await fetchTraktRecommendationResult(
        traktToken,
        mediaType === 'movie' ? 'movies' : 'shows',
        100,
        user,
        providedTraktResult
    );
    const traktTmdbIds = [...new Set(traktResult.items
        .map(item => item.movie?.ids?.tmdb || item.show?.ids?.tmdb || item.ids?.tmdb)
        .filter(Boolean)
        .map(String))].slice(0, 100);

    if (!traktResult.available || traktTmdbIds.length === 0) {
        return buildFallback(traktResult.available);
    }

    const catalogId = mediaType === 'movie' ? 'yaca_trakt_filtered_movies' : 'yaca_trakt_filtered_series';
    const impressionMap = await getImpressionMap(userId, context, catalogId, traktTmdbIds);

    const scored = await rateLimitedMap(
        traktTmdbIds,
        async (id) => {
            const seenDays = impressionMap.get(String(id)) || 0;
            const penaltyMultiplier = calculateImpressionPenalty(seenDays);

            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, id, types);
            if (!details) return null;
            if (isKidsMode && isItemInappropriateForKids(details)) return null;
            const score = ProfileScorer.calculateItemMatch(details, profile, { dnaFilters, globalProfile, kidsMode: isKidsMode });
            if (isKidsMode && score <= 0) return null;
            return { data: { ...details, id: details.id ?? id }, score: score * penaltyMultiplier };
        },
        { batchSize: 3, delayMs: 150 }
    );

    const sorted = sortScoredByScore(scored.filter(Boolean), item => item.score);
    const deduplicated = mediaType === 'movie' ? deduplicateByCollection(sorted) : sorted;
    let finalItems = deduplicated;
    if (isKidsMode) {
        const safeIds = new Set(applyKidsMode(deduplicated.map(item => item.data)).map(item => normalizeContentId(item.id)));
        finalItems = deduplicated.filter(item => safeIds.has(normalizeContentId(item.data.id)));
    }

    if (finalItems.length === 0) {
        return buildFallback(true);
    }

    return {
        ids: finalItems
            .slice(0, 100)
            .map(item => ({
                id: String(item.data.id),
                matchScore: Math.min(100, Math.max(1, Math.round(item.score * 10)))
            })),
        traktAvailable: true,
        fallbackUsed: false
    };
}

async function buildTraktFilteredCatalog(userId, context, traktToken, tmdbApiKey, mediaType, isKidsMode = false) {
    const result = await buildTraktFilteredCatalogWithMeta(userId, context, traktToken, tmdbApiKey, mediaType, isKidsMode);
    return result.ids;
}

module.exports = {
    buildDirectPresetCatalog,
    buildTopGenresMixCatalog,
    buildHybridCatalog,
    buildHiddenGemsCatalog,
    buildTraktFilteredCatalog,
    buildTraktFilteredCatalogWithMeta
};
