const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/engines/hybrid/catalogStrategies.js');
let content = fs.readFileSync(file, 'utf8');

// The replacement logic will replace buildTopGenresMixCatalog and buildHiddenGemsCatalog
// to use parallel specific queries per Topos/Keyword + Anime Ratio.

const newLogic = `
function getAnimeProportion(profile) {
    if (!profile.catalogs || profile.catalogs.length === 0) return 0;
    const animeCount = profile.catalogs.filter(c => c.isAnime).length;
    return animeCount / profile.catalogs.length;
}

/**
 * Esegue query parallele su DuckDB raggruppate per Topos/Keyword ("Smart AND"),
 * applicando la proporzione esatta per forzare (o meno) il flag Anime.
 */
async function fetchSmartAndPool(profile, tmdbApiKey, mediaType, baseFilters = [], limitPerQuery = 50) {
    const types = mediaType === 'movie' ? 'movie' : 'tv';
    
    // 1. Calcolo Proporzione Anime
    const animeRatio = getAnimeProportion(profile);
    const { user, context } = profile;
    const globalProfile = null; // not strictly needed for the fetch, used later for scoring
    
    // 2. Estrazione DNA
    const topGenres = computeTopGenres(profile, 3, user, context);
    const topL2Ids = getTopNodeIds(profile, 'L2', 3);
    let directKwIds = computeTopKeywords(profile, 10, user, context);
    
    // Costruiamo i cluster (Topoi + Keywords)
    const clusters = [];
    
    // Cluster da Topoi L2
    for (const l2Id of topL2Ids) {
        const toposKwIds = getKeywordsForNodeIds([l2Id], 'L2');
        if (toposKwIds.length > 0) {
            clusters.push({ name: \`Topos \${l2Id}\`, keywords: toposKwIds });
        }
    }
    
    // Se non abbiamo L2 (es. profilo nuovo), usiamo le direct keywords a coppie o singole
    if (clusters.length === 0 && directKwIds.length > 0) {
        // Raggruppiamo a coppie per simulare piccoli cluster
        for (let i = 0; i < directKwIds.length; i += 2) {
            const pair = [directKwIds[i]];
            if (directKwIds[i+1]) pair.push(directKwIds[i+1]);
            clusters.push({ name: \`KwPair \${pair.join(',')}\`, keywords: pair });
        }
    }
    
    if (clusters.length === 0 && topGenres.length === 0) {
        return { pool: [], animeRatio }; 
    }
    
    // Se non abbiamo cluster, creiamo un cluster fittizio vuoto per far girare almeno i generi
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
        
        // Applichiamo la Quota Anime: se l'indice è dentro la quota, forziamo F.anime()
        if (index < animeQueriesLimit) {
            where.push(F.anime()); // Deve essere strettamente anime
        } else if (animeRatio < 1) {
            // Se non siamo in quota anime E il profilo non è 100% anime,
            // possiamo escludere gli anime da questa query per garantire varietà occidentale
            // where.push(F.not(F.anime())); // Opzionale: evita overlap
        }
        
        const preset = { type: types, where, orderBy: S.POPULAR };
        try {
            const results = await getDuckDbCatalogFromPreset(preset, 0, limitPerQuery);
            return results || [];
        } catch(e) {
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
    
    const { pool } = await fetchSmartAndPool(profile, tmdbApiKey, mediaType, baseFilters, 100);
    
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
    
    return scored.sort((a, b) => b.score - a.score).slice(0, 100).map(i => ({ 
        id: String(i.data.id), 
        matchScore: Math.min(100, Math.max(1, Math.round(i.score))), 
        rawTMDB: i.data 
    }));
}
`;

const oldFunction1 = `/**
 * 🎯 Hero Catalog 1: True Blend ("Scelti per Te")
 */
async function buildTopGenresMixCatalog(userId, context, tmdbApiKey, mediaType) {`;

// Replace from buildTopGenresMixCatalog to the start of buildHybridCatalog
const startIdx = content.indexOf(oldFunction1);
const endIdx = content.indexOf(`/**
 * 🕸️ Hero Catalog 2: Super-Seed Network ("La Rete dei tuoi Preferiti")
 */`);

if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + newLogic + '\n' + content.substring(endIdx);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Updated True Blend with Smart AND strategy.");
}

// Now replace buildHiddenGemsCatalog
content = fs.readFileSync(file, 'utf8');
const oldHiddenGems = `/**
 * 💎 Hero Catalog 3: Hidden Gems ("Gemme Nascoste" / Anti-Trash)
 */
async function buildHiddenGemsCatalog(userId, context, tmdbApiKey, mediaType) {`;

const newHiddenGems = `/**
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
    
    const { pool } = await fetchSmartAndPool(profile, tmdbApiKey, mediaType, baseFilters, 100);
    
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
    
    return scored.sort((a, b) => b.score - a.score).slice(0, 100).map(i => ({ 
        id: String(i.data.id), 
        matchScore: Math.min(100, Math.max(1, Math.round(i.score))), 
        rawTMDB: i.data 
    }));
}`;

const startHiddenIdx = content.indexOf(oldHiddenGems);
const endHiddenIdx = content.indexOf(`/**
 * 🌐 Hero Catalog 4: Trakt Filtered ("Suggeriti dalla Community")
 */`);

if (startHiddenIdx !== -1 && endHiddenIdx !== -1) {
    content = content.substring(0, startHiddenIdx) + newHiddenGems + '\n' + content.substring(endHiddenIdx);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Updated Hidden Gems with Smart AND strategy.");
}

