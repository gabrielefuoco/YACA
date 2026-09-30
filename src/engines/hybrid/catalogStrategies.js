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
    HIDDEN_GEMS_MAX_POPULARITY,
    getImpressionMap,
    calculateImpressionPenalty
} = require('./dataFetchers');
const { computeTopGenres, computeTopKeywords, calculateHybridScore } = require('./scoringEngine');
const ProfileScorer = require('../../profile/ProfileScorer');
const { getDuckDbCatalogFromPreset, getDuckDbMetaDetails } = require('../../catalog/providers/DuckDbProvider');
const { F, S, G } = require('../../data/filters');
const { isAnimeContent, normalizeAnimeMarker } = require('../../utils/animeIdentity');

function isItemAnime(item) {
    if (!item) return false;
    const target = item.data || item.rawTMDB || item;
    return normalizeAnimeMarker(target) === true;
}

function matchesTypeSelectors(item, typeSelectors) {
    if (!typeSelectors) return true;
    const animeSelector = typeSelectors.anime;
    if (animeSelector === 'only') {
        return isItemAnime(item);
    }
    if (animeSelector === 'exclude') {
        return !isItemAnime(item);
    }
    return true;
}

function resolveTypeSelectors(user, context, directTypeSelectors = null) {
    if (directTypeSelectors && typeof directTypeSelectors === 'object') {
        return directTypeSelectors;
    }
    const profiles = user?.profiles ?? user?.config?.profiles ?? [];
    const activeProfile = profiles.find(p => p.id === context);
    return activeProfile?.settings?.typeSelectors || activeProfile?.typeSelectors || null;
}

const graph = require('../graph/HierarchicalGraph');

const HERO_DIVERSITY_CAPS = Object.freeze({ genre: 3, highMatchGenreCap: 6, director: 1, strand: 3, highMatchThreshold: 3.8 });
const HERO_COLLECTION_CAP = 1;
const HIDDEN_CHILD_ORIENTED_GENRE_IDS = new Set(['16', '10751', '10762']);
const HIDDEN_MUSIC_GENRE_ID = 10402;

// Ticket 13 — pesi e cap dei seed reali del Seed Network (loved 4 / liked 3 /
// visto 2 / libreria 1), più Trakt e DNA come sorgenti di riserva.
const SEED_SIGNAL_WEIGHTS = Object.freeze({ loved: 4, liked: 3, watched: 2, library: 1, trakt: 3, dna: 2 });
const SEED_SIGNAL_LIMITS = Object.freeze({ loved: 20, liked: 15, watched: 15, library: 15 });
const SEED_TRAKT_LIMIT = 10;
const SEED_DNA_LIMIT = 5;
const SEED_DNA_MIN_REAL_SEEDS = 5;
const SEED_NETWORK_TARGET_SIZE = 100;

function mapGenreIdsToTarget(genres) {
    return [...new Set((genres || []).flatMap(genre => {
        const id = Number(genre);
        if (!Number.isFinite(id)) return [];
        return [id, ...G.getEquivalentGenreIds(id)];
    }))];
}

function getTopNodeIds(profile, level = 'L2', limit = 2) {
    if (!profile || !profile.compiledVectors || !profile.compiledVectors.V_final) return [];
    const entries = profile.compiledVectors.V_final instanceof Map
        ? Array.from(profile.compiledVectors.V_final.entries())
        : Object.entries(profile.compiledVectors.V_final);
    return entries
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

function getItemData(item) {
    return item?.data || item?.rawTMDB || item || {};
}

function getItemGenreIds(item) {
    const data = getItemData(item);
    const rawGenres = data.genre_ids || (data.genres ? data.genres.map(genre => (
        typeof genre === 'object' && genre !== null ? genre.id : genre
    )) : []);
    return [...new Set(rawGenres.filter(id => id !== null && id !== undefined).map(String))];
}

function getCollectionId(item) {
    const data = getItemData(item);
    const rawId = data.collection_id ?? data.belongs_to_collection?.id;
    if (rawId === null || rawId === undefined || String(rawId).trim() === '') return null;
    return String(rawId).trim();
}

/**
 * Mantiene al massimo `maxPerCollection` titoli per saga, mantenendo per
 * saga i candidati già ordinati per score/ordine.
 */
function deduplicateByCollection(scoredItems, maxPerCollection = HERO_COLLECTION_CAP) {
    const collectionCounts = new Map();
    const result = [];

    for (const item of scoredItems || []) {
        const collectionId = getCollectionId(item);
        if (collectionId) {
            const count = collectionCounts.get(collectionId) || 0;
            if (count >= maxPerCollection) continue;
            collectionCounts.set(collectionId, count + 1);
        }
        result.push(item);
    }

    return result;
}

/**
 * Applica i cap all'intero elenco. Il vecchio `diversified + remaining`
 * ricostruiva di fatto la lista originale e neutralizzava i cap dopo le prime
 * posizioni; qui i candidati eccedenti restano esclusi.
 */
function applyHeroQualityCaps(items, caps = HERO_DIVERSITY_CAPS, collectionCap = HERO_COLLECTION_CAP) {
    const withoutFranchiseDuplicates = deduplicateByCollection(items, collectionCap);
    if (typeof ProfileScorer.applyDiversityCaps !== 'function') return withoutFranchiseDuplicates;
    return ProfileScorer.applyDiversityCaps(withoutFranchiseDuplicates, caps);
}

function getItemDirectorIds(item) {
    const data = getItemData(item);
    const credits = data.credits?.crew || data.rawTMDB?.credits?.crew || [];
    return [...new Set(credits
        .filter(credit => credit?.job === 'Director' && credit?.id !== undefined)
        .map(credit => String(credit.id)))];
}

function getProspectiveCapOverflow(item, genreCounts, directorCounts, strandCounts, caps, selected = []) {
    const genres = getItemGenreIds(item);
    const specificGenres = genres.filter(g => g !== '18' && g !== '10770');
    const checkGenres = specificGenres.length > 0 ? specificGenres : genres;

    let genreOverflow = 0;
    const score = item.score ?? item.rawScore ?? ((item.matchScore ?? 0) / 10);
    const effGenreCap = (score >= (caps?.highMatchThreshold ?? 3.8)) ? (caps?.highMatchGenreCap ?? (caps?.genre ?? 3)) : (caps?.genre ?? 3);
    for (const genreId of checkGenres) {
        genreOverflow += Math.max((genreCounts.get(genreId) || 0) + 1 - effGenreCap, 0);
    }

    let directorOverflow = 0;
    for (const directorId of getItemDirectorIds(item)) {
        directorOverflow += Math.max((directorCounts.get(directorId) || 0) + 1 - (caps?.director ?? 1), 0);
    }

    let strandOverflow = 0;
    const strand = typeof ProfileScorer.getItemNarrativeStrand === 'function'
        ? ProfileScorer.getItemNarrativeStrand(item)
        : null;
    if (strand && strandCounts) {
        strandOverflow += Math.max((strandCounts.get(strand) || 0) + 1 - (caps?.strand ?? caps?.filone ?? 3), 0);
    }

    // Penalità consecutiva: evita cluster di item dello stesso filone uno dopo l'altro nel catalogo
    let consecutivePenalty = 0;
    if (selected.length > 0) {
        const lastItem = selected[selected.length - 1];
        const lastStrand = typeof ProfileScorer.getItemNarrativeStrand === 'function'
            ? ProfileScorer.getItemNarrativeStrand(lastItem)
            : null;
        if (lastStrand && strand && lastStrand === strand) {
            consecutivePenalty = 50;
        }
    }

    return (genreOverflow * 10) + (directorOverflow * 1000) + (strandOverflow * 200) + consecutivePenalty;
}

function incrementCapCounts(item, genreCounts, directorCounts, strandCounts) {
    for (const genreId of getItemGenreIds(item)) {
        genreCounts.set(genreId, (genreCounts.get(genreId) || 0) + 1);
    }
    for (const directorId of getItemDirectorIds(item)) {
        directorCounts.set(directorId, (directorCounts.get(directorId) || 0) + 1);
    }
    if (typeof ProfileScorer.getItemNarrativeStrand === 'function' && strandCounts) {
        const strand = ProfileScorer.getItemNarrativeStrand(item);
        if (strand) {
            strandCounts.set(strand, (strandCounts.get(strand) || 0) + 1);
        }
    }
}

/**
 * I cap garantiscono diversità per genere, regista e filone narrativo.
 * Se la selezione stretta è inferiore a targetSize (es. 100), il refill cap-aware
 * attinge dalla coda per riempire l'intero catalogo target senza lasciare pagine
 * corte e prevenendo cluster tematici consecutivi.
 */
function finalizeHeroQualityCandidates(items, caps = HERO_DIVERSITY_CAPS, targetSize = 100) {
    const uniqueItems = deduplicateByCollection(items);
    const target = Math.max(0, Number(targetSize) || 0);
    if (typeof ProfileScorer.applyDiversityCaps !== 'function') return uniqueItems.slice(0, target);

    const strictlyCapped = ProfileScorer.applyDiversityCaps(uniqueItems, caps);
    const cappedTarget = Math.min(target, uniqueItems.length);
    if (strictlyCapped.length >= cappedTarget) return strictlyCapped.slice(0, target);

    const strictSet = new Set(strictlyCapped);
    const selected = [...strictlyCapped];
    const genreCounts = new Map();
    const directorCounts = new Map();
    const strandCounts = new Map();
    for (const item of strictlyCapped) {
        incrementCapCounts(item, genreCounts, directorCounts, strandCounts);
    }

    const remaining = uniqueItems.filter(item => !strictSet.has(item));
    while (selected.length < cappedTarget && remaining.length > 0) {
        let bestIndex = 0;
        let bestOverflow = Infinity;
        for (let index = 0; index < remaining.length; index++) {
            const overflow = getProspectiveCapOverflow(
                remaining[index], genreCounts, directorCounts, strandCounts, caps, selected
            );
            if (overflow < bestOverflow) {
                bestOverflow = overflow;
                bestIndex = index;
                if (overflow === 0) break;
            }
        }
        const [next] = remaining.splice(bestIndex, 1);
        selected.push(next);
        incrementCapCounts(next, genreCounts, directorCounts, strandCounts);
    }

    return selected;
}

function isHiddenGemPopularityAllowed(value) {
    const popularity = Number(value);
    return Number.isFinite(popularity) && popularity <= HIDDEN_GEMS_MAX_POPULARITY;
}

function passesQualityFloor(item, mediaType = 'movie', isHiddenGems = false) {
    if (!item) return false;
    const target = item.rawTMDB || item.data || item;
    const voteCount = typeof target.vote_count === 'number' ? target.vote_count : (typeof item.vote_count === 'number' ? item.vote_count : undefined);
    const voteAvg = typeof target.vote_average === 'number' ? target.vote_average : (typeof item.vote_average === 'number' ? item.vote_average : undefined);

    // If it's hidden gems, niche titles with lower vote count are allowed by design
    if (!isHiddenGems) {
        if (voteCount !== undefined && voteCount < 300) return false;
        if (voteAvg !== undefined && voteAvg < 6.5) return false; // Ticket 17: allineato alla sorgente del fill (fetchTopRatedPeriodFallbackIds: vote_average.gte 6.5)
    }

    // Exclude TV specials / episodes inside movie catalogs (Leva 4)
    if (mediaType === 'movie') {
        const rawGenres = target.genre_ids || (target.genres ? target.genres.map(g => (typeof g === 'object' && g !== null ? (g.id ?? g) : g)) : []);
        const gids = rawGenres.map(Number);
        const kws = Array.isArray(target.keywords)
            ? target.keywords
            : (target.keywords?.results || target.keywords?.keywords || []);
        const title = target.title || target.name || item.name || '';
        const isSpecialOrEpisode = target.episode_number !== undefined
            || (target.runtime && target.runtime <= 20)
            || (gids.includes(10770) && kws.some(k => /tv episode|special/i.test(typeof k === 'object' ? k.name : k)))
            || /special|abominevole sposa/i.test(title);
        if (isSpecialOrEpisode) return false;
    }
    return true;
}

function getVectorAffinity(vector, prefix, id) {
    if (!vector || id === null || id === undefined) return 0;
    if (typeof ProfileScorer.getVectorScore === 'function') {
        return ProfileScorer.getVectorScore(vector, prefix, id);
    }
    return Number(vector[`${prefix}:${String(id)}`]) || 0;
}

function getItemKeywords(item) {
    const data = getItemData(item);
    if (Array.isArray(data.keywords)) return data.keywords;
    return data.keywords?.results || data.keywords?.keywords || [];
}

function getItemKeywordIds(item) {
    return [...new Set(getItemKeywords(item).map(keyword => {
        const id = typeof keyword === 'object' && keyword !== null ? (keyword.id ?? keyword.name) : keyword;
        return id === null || id === undefined ? null : String(id);
    }).filter(Boolean))];
}

function hasAffinityForAny(vector, prefix, ids) {
    return ids.some(id => getVectorAffinity(vector, prefix, id) > 0);
}

/**
 * Le coda lunga deve essere pertinente, non soltanto poco vista. È ammesso
 * un solo affinità genre/keyword/regista; i cluster children/kids e concerti
 * richiedono inoltre un'esplicita affinità del profilo per la famiglia di
 * generi da cui provengono (così il Cinefilo non eredita anime/kids da
 * `comedy`, mentre Otaku e Famiglia li mantengono).
 */
function isHiddenGemAlignedWithProfile(item, profile) {
    const vector = profile?.compiledVectors?.V_final;
    if (!vector || typeof vector !== 'object' || Object.keys(vector).length === 0) return true;

    const genreIds = getItemGenreIds(item);
    const keywordIds = getItemKeywordIds(item);
    const data = getItemData(item);

    // Le persone (registi, cast) non fanno più parte del DNA: restano generi e keyword.
    const hasDnaAffinity = hasAffinityForAny(vector, 'g', genreIds)
        || hasAffinityForAny(vector, 'k', keywordIds);
    if (!hasDnaAffinity) return false;

    const childGenreIds = genreIds.filter(id => HIDDEN_CHILD_ORIENTED_GENRE_IDS.has(id));
    const hasChildGenreAffinity = hasAffinityForAny(vector, 'g', childGenreIds);
    if (childGenreIds.length > 0 && !hasChildGenreAffinity) return false;

    const keywordItems = getItemKeywords(item);
    const isAnime = isAnimeContent({
        tmdbId: data.id ?? data._tmdbId,
        genreIds,
        originalLanguage: data.original_language,
        keywords: keywordItems
    });
    const isMangaAdaptation = keywordItems.some(keyword => (
        typeof keyword?.name === 'string' && /based on manga/i.test(keyword.name)
    ));
    if ((isAnime || isMangaAdaptation) && !hasChildGenreAffinity) return false;

    if (genreIds.includes(String(HIDDEN_MUSIC_GENRE_ID))
        && getVectorAffinity(vector, 'g', HIDDEN_MUSIC_GENRE_ID) <= 0) return false;

    return true;
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

async function fetchSeedFallbackIds(tmdbApiKey, mediaType, limit, isKidsMode, typeSelectors = null) {
    // L'adapter mantiene compatibili i mock legacy dei test; in produzione usa sempre il fallback dedicato.
    const fetcher = typeof fetchTopRatedPeriodFallbackIds === 'function'
        ? fetchTopRatedPeriodFallbackIds
        : fetchPopularFallbackIds;
    return fetcher(tmdbApiKey, mediaType, limit, isKidsMode, typeSelectors);
}

async function fetchCommunityFallbackIds(tmdbApiKey, mediaType, limit, isKidsMode, typeSelectors = null) {
    const fetcher = typeof fetchUndiscoveredFallbackIds === 'function'
        ? fetchUndiscoveredFallbackIds
        : fetchPopularFallbackIds;
    return fetcher(tmdbApiKey, mediaType, limit, isKidsMode, typeSelectors);
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
async function buildDirectPresetCatalog(presetId, userId, context, tmdbApiKey, mediaType, isKidsMode = false, directTypeSelectors = null) {
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
                if (!matchesTypeSelectors(item, directTypeSelectors)) continue;
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
async function fetchSmartAndPool(profile, tmdbApiKey, mediaType, baseFilters = [], limitPerQuery = 50, isKidsMode = false, typeSelectors = null) {
    const types = mediaType === 'movie' ? 'movie' : 'series';
    
    const { user, context } = profile;
    const globalProfile = null; // not strictly needed for the fetch, used later for scoring

    // 2. Estrazione DNA
    const topGenres = computeTopGenres(profile, 3, user, context);
    const mappedTopGenres = mapGenreIdsToTarget(topGenres);
    const topL2Ids = getTopNodeIds(profile, 'L2', 3);
    let directKwIds = computeTopKeywords(profile, 10, user, context);

    // 1. Calcolo Proporzione Anime
    let animeRatio = getAnimeProportion(profile, directKwIds, mappedTopGenres);
    if (typeSelectors?.anime === 'only') {
        animeRatio = 1.0;
    } else if (typeSelectors?.anime === 'exclude') {
        animeRatio = 0.0;
    }
    
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
        if (typeSelectors?.anime === 'only') {
            where.push(F.anime); // Deve essere strettamente anime
        } else if (typeSelectors?.anime === 'exclude') {
            where.push(`NOT (${F.anime})`);
        } else if (index < animeQueriesLimit) {
            where.push(F.anime);
        }
        
        const preset = { type: types, where, orderBy: S.POPULAR };
        console.log(`[Smart AND Query ${index + 1}/${totalQueries}] WHERE:`, JSON.stringify(where));
        try {
            let results = await getDuckDbCatalogFromPreset(preset, 0, Math.min(limitPerQuery, 100));
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

    // 4. Canale Generi Primari (High Recall & Quality)
    // Garantisce che i titoli di punta, i capolavori e i grandi successi coerenti con i generi del DNA
    // (es. Il Padrino, La Forma della Voce, Your Name, I sette samurai, Léon) siano sempre estratti
    // tra i candidati, affidando allo scoring VSM e ai diversity caps il compito di ordinarli.
    if (mappedTopGenres.length > 0) {
        const genreBaseWhere = [...baseFilters];
        if (isKidsMode) {
            genreBaseWhere.push(F.notGenre(...ADULT_GENRE_IDS.split(',').map(Number)));
            genreBaseWhere.push(F.notKeyword(...ADULT_KEYWORD_IDS.split(',').map(Number)));
        }
        if (typeSelectors?.anime === 'only') {
            genreBaseWhere.push(F.anime);
        } else if (typeSelectors?.anime === 'exclude') {
            genreBaseWhere.push(`NOT (${F.anime})`);
        }
        genreBaseWhere.push(F.any(...mappedTopGenres.map(g => F.genre(Number(g)))));

        promises.push((async () => {
            try {
                const trPreset = { type: types, where: genreBaseWhere, orderBy: S.TOP_RATED };
                const trResults = await getDuckDbCatalogFromPreset(trPreset, 0, Math.min(limitPerQuery, 200));
                return trResults || [];
            } catch (e) {
                return [];
            }
        })());

        promises.push((async () => {
            try {
                const popPreset = { type: types, where: genreBaseWhere, orderBy: S.POPULAR };
                const popResults = await getDuckDbCatalogFromPreset(popPreset, 0, Math.min(limitPerQuery, 200));
                return popResults || [];
            } catch (e) {
                return [];
            }
        })());
    }
    
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
    if (typeSelectors?.anime === 'only') {
        finalPool = finalPool.filter(isItemAnime);
    } else if (typeSelectors?.anime === 'exclude') {
        finalPool = finalPool.filter(item => !isItemAnime(item));
    }
    return { pool: finalPool, animeRatio };
}

async function buildFilteredCatalog(userId, context, tmdbApiKey, mediaType, catalogId, baseFilters, fallbackFn, isKidsMode = false, directTypeSelectors = null) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    const typeSelectors = resolveTypeSelectors(user, context, directTypeSelectors);
    if (!profile) return fallbackFn(tmdbApiKey, mediaType, 160, isKidsMode, typeSelectors);
    
    profile.user = user;
    profile.context = context;
    
    const { pool } = await fetchSmartAndPool(profile, tmdbApiKey, mediaType, baseFilters, 1000, isKidsMode, typeSelectors);
    let candidatePool = pool;
    if (isKidsMode) {
        candidatePool = applyKidsMode(pool);
    }
    if (typeSelectors?.anime === 'only') {
        candidatePool = candidatePool.filter(isItemAnime);
    } else if (typeSelectors?.anime === 'exclude') {
        candidatePool = candidatePool.filter(item => !isItemAnime(item));
    }
    
    if (candidatePool.length === 0) {
        return fallbackFn(tmdbApiKey, mediaType, 160, isKidsMode, typeSelectors);
    }
    
    const impressionMap = await getImpressionMap(userId, context, catalogId, candidatePool.map(m => String(m._tmdbId || m.id.split(':')[1])));
    const dnaFilters = getProfileDnaFilters(user, context);
    
    const isHiddenGems = catalogId === 'yaca_hidden_gems_movies' || catalogId === 'yaca_hidden_gems_series';
    const scored = candidatePool.map(item => {
        const id = String(item._tmdbId || item.id.split(':')[1]);
        const seenDays = impressionMap.get(id) || 0;
        const penaltyMultiplier = calculateImpressionPenalty(seenDays);
        const tmdbData = item.rawTMDB || item;
        if (isKidsMode && isItemInappropriateForKids(tmdbData)) return null;
        if (!passesQualityFloor(tmdbData, mediaType, isHiddenGems)) return null;
        if (isHiddenGems && !isHiddenGemPopularityAllowed(tmdbData.popularity ?? item.popularity)) return null;
        if (isHiddenGems && !isHiddenGemAlignedWithProfile(tmdbData, profile)) return null;
        if (!matchesTypeSelectors(tmdbData, typeSelectors)) return null;
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
    let finalItems = finalizeHeroQualityCandidates(sorted, HERO_DIVERSITY_CAPS);
    if (isKidsMode) {
        finalItems = applyKidsMode(finalItems);
    }
    finalItems = finalItems.filter(item => matchesTypeSelectors(item.data || item, typeSelectors));
    
    if (finalItems.length === 0) {
        return fallbackFn(tmdbApiKey, mediaType, 160, isKidsMode, typeSelectors);
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
async function buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType, isKidsMode = false, typeSelectors = null) {
    const catalogId = mediaType === 'movie' ? 'yaca_true_blend_movies' : 'yaca_true_blend_series';
    const baseFilters = [F.minVotes(1000)];
    return buildFilteredCatalog(userId, context, tmdbApiKey, mediaType, catalogId, baseFilters, fetchPopularFallbackIds, isKidsMode, typeSelectors);
}

/**
 * 🕸️ Hero Catalog 2: Super-Seed Network ("La Rete dei tuoi Preferiti")
 */
function toSeedMediaType(type) {
    return (type === 'tv' || type === 'series' || type === 'anime') ? 'tv' : 'movie';
}

function normalizeSeedId(rawId) {
    if (rawId === null || rawId === undefined) return null;
    const id = String(rawId).trim();
    if (!id || ['undefined', 'null', 'nan'].includes(id.toLowerCase())) return null;
    return id;
}

function getSeedTimestamp(...values) {
    for (const value of values) {
        if (!value) continue;
        const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
        if (Number.isFinite(time)) return time;
    }
    return 0;
}

function keepMostRecentSeed(map, id, at) {
    const previous = map.get(id);
    if (previous === undefined || at > previous) map.set(id, at);
}

/**
 * Ticket 13 — I seed arrivano dai segnali reali (WatchHistory.signals +
 * UserLibraryItem) con i pesi loved 4 / liked 3 / visto 2 / libreria 1,
 * filtrati per tipo media e limitati per sorgente.
 * La libreria è per account: la leggiamo solo per i contesti che hanno già una
 * cronologia reale, così un profilo mai sincronizzato resta freddo.
 */
async function collectRealSeeds({ userId, context, mediaType, user = null }) {
    const targetType = mediaType === 'movie' ? 'movie' : 'tv';
    const buckets = {
        loved: new Map(),
        liked: new Map(),
        watched: new Map(),
        library: new Map()
    };
    let historyDocs = [];
    try {
        const WatchHistory = require('../../models/WatchHistory');
        historyDocs = await WatchHistory.find({ owner: userId, context }).lean();
        if (!Array.isArray(historyDocs)) historyDocs = [];
    } catch (_e) {
        historyDocs = [];
    }

    for (const doc of historyDocs) {
        if (toSeedMediaType(doc.type) !== targetType) continue;
        const id = normalizeSeedId(doc.tmdbId);
        if (!id) continue;
        const fallbackAt = getSeedTimestamp(doc.lastWatchedAt, doc.createdAt);
        const signals = Array.isArray(doc.signals) && doc.signals.length > 0
            ? doc.signals
            : [{ type: 'watched', at: doc.lastWatchedAt }];
        for (const signal of signals) {
            const bucket = buckets[signal?.type];
            if (!bucket) continue;
            keepMostRecentSeed(bucket, id, getSeedTimestamp(signal.at) || fallbackAt);
        }
    }

    if (historyDocs.length > 0) {
        try {
            let addonUuid = user?.uuid || user?.addonUuid || null;
            if (!addonUuid) {
                const UserAccount = require('../../db/models/UserAccount');
                const account = await UserAccount.findOne({ userId }).lean();
                addonUuid = account?.addonUuid || null;
            }
            if (addonUuid) {
                const UserLibraryItem = require('../../db/models/UserLibraryItem');
                const libraryDocs = await UserLibraryItem.find({
                    addonUuid,
                    removed: { $ne: true },
                    tmdbId: { $exists: true, $ne: null }
                }).lean();
                for (const lib of Array.isArray(libraryDocs) ? libraryDocs : []) {
                    if (toSeedMediaType(lib.type) !== targetType) continue;
                    const id = normalizeSeedId(lib.tmdbId);
                    if (!id) continue;
                    keepMostRecentSeed(buckets.library, id, getSeedTimestamp(lib._mtime, lib.addedAt, lib.createdAt));
                }
            }
        } catch (_e) {}
    }

    const seeds = new Map();
    const counts = { loved: 0, liked: 0, watched: 0, library: 0 };
    for (const [type, bucket] of Object.entries(buckets)) {
        const limit = SEED_SIGNAL_LIMITS[type] ?? 0;
        const selected = [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
        counts[type] = selected.length;
        for (const [id] of selected) {
            seeds.set(id, (seeds.get(id) || 0) + SEED_SIGNAL_WEIGHTS[type]);
        }
    }
    return { seeds, counts };
}

/**
 * Ticket 13 — il refill di finalizeHeroQualityCandidates può riaccodare in blocco
 * i candidati che eccedono i cap, ricreando lunghi run dello stesso filone.
 * Questo passaggio garantisce il vincolo sul massimo run consecutivo: sposta
 * avanti la prima alternativa di filone diverso e, se non ne esiste nessuna,
 * esclude l'item in eccesso (il catalogo viene poi riempito dal fallback).
 */
function enforceMaxStrandRun(items, maxRun = HERO_DIVERSITY_CAPS.strand) {
    if (!Array.isArray(items) || items.length <= maxRun) return Array.isArray(items) ? items : [];
    if (typeof ProfileScorer.getItemNarrativeStrand !== 'function') return items;

    const runLimit = Math.max(1, Number(maxRun) || 1);
    const getStrand = item => ProfileScorer.getItemNarrativeStrand(item) || 'strand:unknown';
    const result = [];
    const pending = [...items];
    let currentStrand = null;
    let currentRun = 0;

    while (pending.length > 0) {
        const candidate = pending.shift();
        const strand = getStrand(candidate);
        if (strand !== currentStrand) {
            result.push(candidate);
            currentStrand = strand;
            currentRun = 1;
            continue;
        }
        if (currentRun < runLimit) {
            result.push(candidate);
            currentRun += 1;
            continue;
        }
        const alternativeIndex = pending.findIndex(next => getStrand(next) !== strand);
        if (alternativeIndex === -1) continue;
        const alternative = pending.splice(alternativeIndex, 1)[0];
        pending.unshift(candidate);
        result.push(alternative);
        currentStrand = getStrand(alternative);
        currentRun = 1;
    }

    return result;
}

/**
 * Riempie il Seed Network quando i segnali reali non bastano (profilo freddo):
 * il fallback top-rated del periodo viene idratato da DuckDB, filtrato dal
 * pavimento di qualità e ordinato con lo stesso score VSM del profilo.
 */
async function buildSeedNetworkFill({ finalItems, tmdbApiKey, mediaType, types, isKidsMode, profile, dnaFilters, globalProfile }) {
    const target = Math.max(0, SEED_NETWORK_TARGET_SIZE - finalItems.length);
    if (target === 0) return [];

    const usedIds = new Set(finalItems.map(item => normalizeContentId(item?.data?.id ?? '')).filter(Boolean));
    const fallbackIds = await fetchSeedFallbackIds(tmdbApiKey, mediaType, 160, isKidsMode);
    const fillItems = [];

    for (const rawId of Array.isArray(fallbackIds) ? fallbackIds : []) {
        if (fillItems.length >= target) break;
        const id = normalizeSeedId(normalizeContentId(rawId));
        if (!id || usedIds.has(id)) continue;
        let raw = null;
        try {
            const duckMeta = await getDuckDbMetaDetails(id, types);
            raw = duckMeta?.rawTMDB || null;
        } catch (_e) {
            raw = null;
        }
        if (!raw) continue;
        if (isKidsMode && isItemInappropriateForKids(raw)) continue;
        if (!passesQualityFloor(raw, mediaType, false)) continue;
        const score = ProfileScorer.calculateItemMatch(raw, profile, { dnaFilters, globalProfile, kidsMode: isKidsMode });
        if (isKidsMode && score <= 0) continue;
        usedIds.add(id);
        fillItems.push({
            data: { ...raw, id: raw.id ?? Number(id) },
            score,
            hybridScore: 0,
            normalizedHybrid: 0,
            combinedScore: score * 0.6
        });
    }

    return fillItems;
}

async function buildHybridCatalog(userId, context, traktToken, tmdbApiKey, mediaType, isKidsMode = false, providedTraktResult = null, directTypeSelectors = null) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    const typeSelectors = resolveTypeSelectors(user, context, directTypeSelectors);
    if (!profile) return fetchSeedFallbackIds(tmdbApiKey, mediaType, 160, isKidsMode, typeSelectors);

    const types = mediaType === 'movie' ? 'movie' : 'series';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const dnaFilters = getProfileDnaFilters(user, context);

    const topGenres = computeTopGenres(profile, 3, user, context);
    const mappedTopGenres = mapGenreIdsToTarget(topGenres);

    // Ticket 13 — seed dai segnali reali: loved 4 / liked 3 / visto 2 / libreria 1.
    const { seeds: realSeeds, counts: seedCounts } = await collectRealSeeds({ userId, context, mediaType, user });

    // Fallback legacy: gli array loved/liked di AddonConfig quando WatchHistory è vuota.
    if (realSeeds.size === 0) {
        const legacyProfile = user?.profiles?.find(p => p.id === context);
        for (const [type, limit] of [['loved', SEED_SIGNAL_LIMITS.loved], ['liked', SEED_SIGNAL_LIMITS.liked]]) {
            for (const rawId of (legacyProfile?.[type] || []).slice(0, limit)) {
                const id = normalizeSeedId(rawId);
                if (!id) continue;
                realSeeds.set(id, (realSeeds.get(id) || 0) + SEED_SIGNAL_WEIGHTS[type]);
                seedCounts[type] += 1;
            }
        }
    }

    const sharedTraktResult = await fetchTraktRecommendationResult(
        traktToken,
        mediaType === 'movie' ? 'movies' : 'shows',
        SEED_TRAKT_LIMIT,
        user,
        providedTraktResult
    );
    const traktIds = sharedTraktResult.items
        .slice(0, SEED_TRAKT_LIMIT)
        .map(item => ({ id: String(item.movie?.ids?.tmdb || item.show?.ids?.tmdb), weight: SEED_SIGNAL_WEIGHTS.trakt }))
        .filter(s => s.id && s.id !== 'undefined');

    let dnaSeeds = [];
    const topL2Ids = getTopNodeIds(profile, 'L2', 2);
    const directKwIds = computeTopKeywords(profile, 10, user, context);
    
    const where = [];
    if (isKidsMode) {
        where.push(F.notGenre(...ADULT_GENRE_IDS.split(',').map(Number)));
        where.push(F.notKeyword(...ADULT_KEYWORD_IDS.split(',').map(Number)));
    }
    if (typeSelectors?.anime === 'only') {
        where.push(F.anime);
    } else if (typeSelectors?.anime === 'exclude') {
        where.push(`NOT (${F.anime})`);
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
    
    if (where.length > 0 && (realSeeds.size + traktIds.length) < SEED_DNA_MIN_REAL_SEEDS) {
        const preset = { type: types, where, orderBy: S.POPULAR };
        console.log(`\n======================================================`);
        console.log(`[Catalog Debug] Seed Network - profile context=${context}`);
        console.log(`[Catalog Debug] DNA Rules (profilo con pochi segnali reali):`);
        where.forEach((rule, idx) => console.log(`   ${idx + 1}. ${rule}`));
        console.log(`======================================================\n`);
        const lightMetas = await getDuckDbCatalogFromPreset(preset, 0, 10);
        if (lightMetas && lightMetas.length > 0) {
            dnaSeeds = lightMetas.slice(0, SEED_DNA_LIMIT).map(item => ({ id: String(item._tmdbId || item.id.split(':')[1]), weight: SEED_SIGNAL_WEIGHTS.dna }));
        }
    }

    const allSeedsMap = new Map(realSeeds);
    [...traktIds, ...dnaSeeds].forEach(({ id, weight }) => {
        allSeedsMap.set(id, (allSeedsMap.get(id) || 0) + weight);
    });

    console.log(`[Catalog Debug] Seed Network - Collected Seeds: loved=${seedCounts.loved}, liked=${seedCounts.liked}, visto=${seedCounts.watched}, libreria=${seedCounts.library}, Trakt=${traktIds.length}, DNA=${dnaSeeds.length}`);

    if (allSeedsMap.size === 0) {
        return fetchSeedFallbackIds(tmdbApiKey, mediaType, 160, isKidsMode, typeSelectors);
    }
    const allSeeds = Array.from(allSeedsMap.entries()).map(([id, weight]) => ({ id, weight }));

    const { getDuckDbCatalogFromFilters } = require('../../catalog/providers/DuckDbProvider');
    const weightedCounts = new Map();
    const bestPositions = new Map();
    const allSimilar = await rateLimitedMap(
        allSeeds,
        async (seed) => ({
            results: await getDuckDbCatalogFromFilters({ similar_to: seed.id }, types, 0, 80, { kidsMode: isKidsMode }).catch(() => []),
            weight: seed.weight
        }),
        { batchSize: 5, delayMs: 50 }
    );
    const itemData = new Map();

    allSimilar.forEach(res => {
        if (!res) return;
        const { results, weight } = res;
        results.forEach((item, position) => {
            weightedCounts.set(item.id, (weightedCounts.get(item.id) || 0) + weight);
            const previousPosition = bestPositions.get(item.id);
            if (previousPosition === undefined || position < previousPosition) {
                bestPositions.set(item.id, position);
            }
            if (!itemData.has(item.id)) itemData.set(item.id, item);
        });
    });

    const candidates = [];
    for (const [tmdbId, weightedScore] of weightedCounts.entries()) {
        const rawItem = itemData.get(tmdbId);
        if (!rawItem) continue;
        if (isKidsMode && isItemInappropriateForKids(rawItem)) continue;
        if (!passesQualityFloor(rawItem, mediaType, false)) continue;
        if (!matchesTypeSelectors(rawItem, typeSelectors)) continue;
        const itemGenres = rawItem.genre_ids || [];
        
        let hybridScore = calculateHybridScore(
            { tmdbId, position: bestPositions.get(tmdbId) ?? null },
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

    // Pre-diversifica il pool completo prima delle chiamate TMDB: i cap non
    // possono più essere neutralizzati dal cutoff e il dettaglio viene idratato
    // solo per i candidati che possono davvero entrare nel catalogo.
    const scoringCandidates = finalizeHeroQualityCandidates(filteredCandidates, HERO_DIVERSITY_CAPS, 120);
    const candidateIds = scoringCandidates.map(c => String(c.data.id));
    const catalogId = mediaType === 'movie' ? 'yaca_seed_network_movies' : 'yaca_seed_network_series';
    const impressionMap = await getImpressionMap(userId, context, catalogId, candidateIds);

    const scored = await rateLimitedMap(
        scoringCandidates,
        async ({ data, hybridScore }) => {
            const seenDays = impressionMap.get(String(data.id)) || 0;
            const penaltyMultiplier = calculateImpressionPenalty(seenDays);

            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, data.id, types);
            const tmdbData = details || data.rawTMDB || data;
            if (isKidsMode && isItemInappropriateForKids(tmdbData)) return null;
            if (!passesQualityFloor(tmdbData, mediaType, false)) return null;
            if (!matchesTypeSelectors(tmdbData, typeSelectors)) return null;
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
            const hydratedData = {
                ...data,
                ...tmdbData,
                id: data.id || tmdbData.id,
                genres: tmdbData.genres || data.genres || data.rawTMDB?.genres || [],
                genre_ids: tmdbData.genre_ids || data.genre_ids || data.rawTMDB?.genres?.map(genre => genre.id) || [],
                credits: tmdbData.credits || data.credits || data.rawTMDB?.credits || { cast: [], crew: [] }
            };
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
    let finalItems = finalizeHeroQualityCandidates(sorted, HERO_DIVERSITY_CAPS);
    if (isKidsMode) {
        finalItems = applyKidsMode(finalItems);
    }
    finalItems = finalItems.filter(item => matchesTypeSelectors(item.data || item, typeSelectors));

    // Ticket 13: il refill dei cap può ricreare lunghi run dello stesso filone.
    finalItems = enforceMaxStrandRun(finalItems, HERO_DIVERSITY_CAPS.strand);

    // Profilo freddo: se i segnali reali non bastano, completa con il fallback
    // top-rated (pavimento qualità + VSM) invece di lasciare pagine corte.
    if (finalItems.length < SEED_NETWORK_TARGET_SIZE) {
        const fillItems = await buildSeedNetworkFill({
            finalItems, tmdbApiKey, mediaType, types, isKidsMode, profile, dnaFilters, globalProfile
        });
        if (fillItems.length > 0) {
            const combined = finalizeHeroQualityCandidates(
                [...finalItems, ...fillItems],
                HERO_DIVERSITY_CAPS,
                SEED_NETWORK_TARGET_SIZE
            );
            finalItems = enforceMaxStrandRun(combined, HERO_DIVERSITY_CAPS.strand);
            console.log(`[Catalog Debug] Seed Network - Fill: +${fillItems.length} fallback (totale=${finalItems.length})`);
        }
    }

    if (finalItems.length === 0) {
        return fetchSeedFallbackIds(tmdbApiKey, mediaType, 160, isKidsMode, typeSelectors);
    }

    return finalItems.slice(0, SEED_NETWORK_TARGET_SIZE).map(i => ({ id: String(i.data.id), matchScore: Math.min(100, Math.max(1, Math.round(i.score * 10))) }));
}

/**
 * 💎 Hero Catalog 3: Hidden Gems ("Gemme Nascoste" / Anti-Trash)
 */
async function buildHiddenGemsCatalog(userId, context, tmdbApiKey, mediaType, isKidsMode = false, typeSelectors = null) {
    const catalogId = mediaType === 'movie' ? 'yaca_hidden_gems_movies' : 'yaca_hidden_gems_series';
    const baseFilters = [
        F.minScore(6.5),
        F.minVotes(50),
        F.maxVotes(1000),
        F.maxPopularity(HIDDEN_GEMS_MAX_POPULARITY)
    ];
    if (mediaType === 'movie') baseFilters.push(F.minRuntime(60));
    
    return buildFilteredCatalog(userId, context, tmdbApiKey, mediaType, catalogId, baseFilters, fetchHiddenGemsFallbackIds, isKidsMode, typeSelectors);
}

/**
 * 🌐 Hero Catalog 4: Trakt Filtered ("Suggeriti dalla Community")
 */
async function buildTraktFilteredCatalogWithMeta(userId, context, traktToken, tmdbApiKey, mediaType, isKidsMode = false, providedTraktResult = null, directTypeSelectors = null) {
    const { profile, user, globalProfile } = await fetchProfileContext(userId, context);
    const typeSelectors = resolveTypeSelectors(user, context, directTypeSelectors);

    const buildFallback = async (traktAvailable = false) => {
        console.warn(`[HeroPool] Degrado Trakt rilevato per ${mediaType}: fallbackUsed=true, traktAvailable=${traktAvailable}`);
        const fallbackIds = await fetchCommunityFallbackIds(tmdbApiKey, mediaType, 160, isKidsMode, typeSelectors);
        return {
            ids: fallbackIds.map(id => {
                if (typeof id === 'object' && id !== null) {
                    return { ...id, traktAvailable, fallbackUsed: true };
                }
                return { id: String(id), traktAvailable, fallbackUsed: true };
            }),
            traktAvailable,
            fallbackUsed: true
        };
    };

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
            if (!passesQualityFloor(details, mediaType, false)) return null;
            if (!matchesTypeSelectors(details, typeSelectors)) return null;
            const score = ProfileScorer.calculateItemMatch(details, profile, { dnaFilters, globalProfile, kidsMode: isKidsMode });
            if (isKidsMode && score <= 0) return null;
            return { data: { ...details, id: details.id ?? id }, score: score * penaltyMultiplier };
        },
        { batchSize: 3, delayMs: 150 }
    );

    const sorted = sortScoredByScore(scored.filter(Boolean), item => item.score);
    let finalItems = finalizeHeroQualityCandidates(sorted, HERO_DIVERSITY_CAPS);
    if (isKidsMode) {
        const safeIds = new Set(applyKidsMode(finalItems.map(item => item.data)).map(item => normalizeContentId(item.id)));
        finalItems = finalItems.filter(item => safeIds.has(normalizeContentId(item.data.id)));
    }
    finalItems = finalItems.filter(item => matchesTypeSelectors(item.data || item, typeSelectors));

    if (finalItems.length === 0) {
        return buildFallback(true);
    }

    return {
        ids: finalItems
            .slice(0, 100)
            .map(item => ({
                id: String(item.data.id),
                matchScore: Math.min(100, Math.max(1, Math.round(item.score * 10))),
                traktAvailable: true,
                fallbackUsed: false
            })),
        traktAvailable: true,
        fallbackUsed: false
    };
}

async function buildTraktFilteredCatalog(userId, context, traktToken, tmdbApiKey, mediaType, isKidsMode = false, directTypeSelectors = null) {
    const result = await buildTraktFilteredCatalogWithMeta(userId, context, traktToken, tmdbApiKey, mediaType, isKidsMode, null, directTypeSelectors);
    return result.ids;
}

module.exports = {
    buildDirectPresetCatalog,
    buildTopGenresMixCatalog,
    buildHybridCatalog,
    buildHiddenGemsCatalog,
    buildTraktFilteredCatalog,
    buildTraktFilteredCatalogWithMeta,
    applyHeroQualityCaps,
    finalizeHeroQualityCandidates,
    enforceMaxStrandRun,
    collectRealSeeds,
    SEED_SIGNAL_WEIGHTS,
    SEED_NETWORK_TARGET_SIZE,
    isHiddenGemPopularityAllowed,
    isHiddenGemAlignedWithProfile
};
