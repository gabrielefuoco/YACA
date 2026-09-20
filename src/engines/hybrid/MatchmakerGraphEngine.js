const graph = require('../graph/HierarchicalGraph');
const { getDuckDbCatalogFromPreset } = require('../../catalog/providers/DuckDbProvider');
const duckDbStore = require('../../db/duckDbStore');
const { F, S } = require('../../data/filters');

const LEVELS = ['L5', 'L4', 'L3', 'L2', 'L1'];

// Mappa concettuale dei Mood -> Keyword strategiche TMDB per l'innesco termico
const MOOD_KEYWORDS_MAP = {
    "Intenso & Ricco d'Azione": ['action', 'thriller', 'survival', 'martial arts', 'superhero', 'explosion', 'shootout', 'violence', 'blood', 'chase', 'murder', 'police', 'revenge'],
    "Rilassante & Leggero": ['feel-good', 'slice of life', 'comedy', 'healing', 'relaxing', 'friendship', 'family', 'vacation', 'peaceful', 'romantic comedy', 'love'],
    "Psicologico & Misterioso": ['mind-bending', 'psychological thriller', 'mystery', 'detective', 'dark', 'plot twist', 'suspense', 'paranoia', 'investigation', 'mind control'],
    "Drammatico & Emozionante": ['tearjerker', 'sad', 'crying', 'melodrama', 'heartbreaking', 'emotional', 'tragedy', 'terminal illness', 'grief', 'loneliness'],
    "Epico & Avventuroso": ['epic', 'journey', 'magic', 'fantasy world', 'space opera', 'adventure', 'quest', 'empire', 'mythology', 'chosen one', 'sword and sorcery']
};

function getKeywordsForNodes(nodeIds, level) {
    return graph.getKeywordsForNodes(nodeIds, level);
}



const IT_TO_EN_GENRES = {
    'azione': 'Action',
    'avventura': 'Adventure',
    'animazione': 'Animation',
    'commedia': 'Comedy',
    'crime': 'Crime',
    'documentario': 'Documentary',
    'dramma': 'Drama',
    'famiglia': 'Family',
    'fantasy': 'Fantasy',
    'fantastico': 'Fantasy',
    'storico': 'History',
    'storia': 'History',
    'horror': 'Horror',
    'musica': 'Music',
    'mistero': 'Mystery',
    'romance': 'Romance',
    'romantico': 'Romance',
    'fantascienza': 'Science Fiction',
    'tv movie': 'TV Movie',
    'film tv': 'TV Movie',
    'thriller': 'Thriller',
    'guerra': 'War',
    'western': 'Western'
};

/**
 * Applica i filtri globali del funnel (Anime, Year) al preset
 */
function applyFunnelFiltersToPreset(preset, filters) {
    if (!filters) return;
    const dateCol = (preset.type === 'tv' || preset.type === 'series') ? '"first_air_date"' : '"release_date"';
    if (filters.yearMin) preset.where.push(`${dateCol} >= '${filters.yearMin}-01-01'`);
    if (filters.yearMax) preset.where.push(`${dateCol} <= '${filters.yearMax}-12-31'`);
    if (filters.isAnime) preset.where.push(F.anime);
    if (filters.genres && filters.genres.length > 0) {
        const normalizedGenres = filters.genres.map(g => {
            const lower = String(g).trim().toLowerCase();
            return IT_TO_EN_GENRES[lower] || g;
        });
        preset.where.push(F.genreStr(...normalizedGenres));
    }
}

async function getCardsForNodes(nodeIds, currentLevel, cardsPerNode, mediaType, filters, history = []) {
    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const nodeKeywords = getKeywordsForNodes(nodeIds, currentLevel);
    
    // Estrai gli ID già visti dalla history per evitare duplicati
    const swipedIds = new Set(history.map(s => {
        return String(s.id).replace(/^[a-zA-Z]+:/, '');
    }));
    
    let allCards = [];
    for (const [nodeId, kwStrs] of nodeKeywords.entries()) {
        if (kwStrs.length === 0) continue;
        
        // Creiamo il preset a mano perché vogliamo fare match sulle keyword a livello stringa
        const preset = {
            type: types,
            where: [ F.minVotes(50) ],
            orderBy: S.POPULAR
        };
        
        applyFunnelFiltersToPreset(preset, filters);
        
        // MATCH STRINGA SU JSON. DuckDB: "keywords" ILIKE '%"nome_keyword"%'
        const safeStrs = kwStrs.map(s => s.replace(/'/g, "''"));
        preset.where.push(`(${safeStrs.map(s => `"keywords" ILIKE '%"${s}"%'`).join(' OR ')})`);
        
        const lightMetas = await getDuckDbCatalogFromPreset(preset, 0, 100); // Fetch a large pool to avoid exhaustion when filtering swiped cards
        
        // Filtriamo i duplicati
        const filteredMetas = lightMetas.filter(c => !swipedIds.has(String(c._tmdbId || c.id).replace(/^[a-zA-Z]+:/, '')));
        const shuffled = filteredMetas.sort(() => 0.5 - Math.random()).slice(0, cardsPerNode);
        
        const mappedCards = shuffled.map(c => ({
            id: String(c.id),
            title: c.name,
            poster: c.poster,
            year: c.releaseInfo,
            overview: c.description,
            genre_ids: c.rawTMDB?.genres?.map(g => g.id) || [],
            type: types,
            _graphNodeId: nodeId,
            _graphLevel: currentLevel
        }));
        
        allCards.push(...mappedCards);
    }
    return allCards.sort(() => 0.5 - Math.random());
}

/**
 * ATTO 1 (Ex ATTO 2): Inizializzazione Tinder Game bypassando L3/L4
 */
async function getMatchmakerInitCards(mediaType, genres, moods, filters) {
    console.log(`[MatchmakerGraphEngine] 🟢 INIT TINDER GAME 🟢`);
    console.log(`[MatchmakerGraphEngine] Type: ${mediaType} | Genres: ${genres} | Moods: ${moods} | Filters:`, filters);

    if (!graph.isLoaded || !graph.data) {
        console.warn('[MatchmakerGraphEngine] Graph not loaded during init!');
        return [];
    }
    
    let moodKeywords = [];
    if (moods && moods.length > 0) {
        moods.forEach(m => {
            if (MOOD_KEYWORDS_MAP[m]) moodKeywords.push(...MOOD_KEYWORDS_MAP[m]);
        });
    }
    const moodSet = new Set(moodKeywords);
    
    // Top L2 Nodes based on Mood intersection
    const l2Scores = [];
    for (const [l2_id, l2_data] of Object.entries(graph.data.L2 || {})) {
        let score = 0;
        const topKws = l2_data.top_keywords || [];
        for (const kw of topKws) {
            if (moodSet.has(kw)) score += 1;
        }
        if (score > 0) {
            l2Scores.push({ id: l2_id, score });
        }
    }
    
    l2Scores.sort((a, b) => b.score - a.score);
    const topL2s = l2Scores.slice(0, 10).map(x => x.id);
    
    if (topL2s.length === 0) {
        console.warn(`[MatchmakerGraphEngine] Fallback: No L2 found for mood. Using random L2.`);
        const allL2s = Object.keys(graph.data.L2 || {});
        if (allL2s.length > 0) topL2s.push(allL2s.sort(() => 0.5 - Math.random())[0]);
    }
    
    // Apply genres logic via filters object so getCardsForNodes can pick it up
    if (!filters) filters = {};
    if (genres && genres.length > 0) {
        filters.genres = genres;
    }
    
    // selectedL2s uses topL2s randomly scrambled, picking up to 4 nodes
    const selectedL2s = topL2s.sort(() => 0.5 - Math.random()).slice(0, 4);
    
    // Generiamo 5 carte per nodo (max 20 carte totali) al primo round
    const cards = await getCardsForNodes(selectedL2s, 'L2', 5, mediaType, filters);
    console.log(`[MatchmakerGraphEngine] Init complete: returning ${cards.length} cards`);
    return cards;
}

/**
 * Heat Map Propagation 
 */
async function getMatchmakerNextCards(mediaType, history, currentLevelStr, filters) {
    console.log(`[MatchmakerGraphEngine] 🔥 NEXT CARDS (Heat Map) 🔥`);
    console.log(`[MatchmakerGraphEngine] Current Level: ${currentLevelStr} | History len: ${history.length}`);
    const levelIdx = LEVELS.indexOf(currentLevelStr);
    
    let nextLevelStr = (levelIdx >= 0 && levelIdx < LEVELS.length - 1) 
        ? LEVELS[levelIdx + 1] 
        : 'L1';
    
    // Se siamo già a L1 o oltre, continuiamo a rimanere su L1 all'infinito
    if (currentLevelStr === 'L1' || nextLevelStr !== 'L2') {
        nextLevelStr = 'L1';
    }
    
    console.log(`[MatchmakerGraphEngine] Target Next Level: ${nextLevelStr}`);
    
    const l1HeatMap = {};
    const likedOrWatchlist = history.filter(s => s.action === 'like' || s.action === 'watchlist');
    const tmdbIds = likedOrWatchlist
        .map(s => Number(String(s.id).replace(/^[a-zA-Z]+:/, '')))
        .filter(n => Number.isFinite(n) && n > 0);

    const metaMap = new Map();
    if (tmdbIds.length > 0) {
        const table = mediaType === 'movie' ? 'movies' : 'tv';
        try {
            const uniqueIds = Array.from(new Set(tmdbIds));
            const rows = await duckDbStore.query(`SELECT id, keywords FROM ${table} WHERE id IN (${uniqueIds.join(',')})`);
            for (const row of rows) {
                let parsedKws = [];
                try { if (row.keywords) parsedKws = JSON.parse(row.keywords); } catch(e){}
                metaMap.set(Number(row.id), parsedKws);
            }
        } catch (e) {
            console.error('[MatchmakerGraphEngine] Error batch fetching metadata for swipes:', e);
        }
    }

    for (const swipe of history) {
        if (swipe.action === 'like' || swipe.action === 'watchlist') {
            const weight = swipe.action === 'watchlist' ? 2 : 1;
            const cleanTmdbId = Number(String(swipe.id).replace(/^[a-zA-Z]+:/, ''));
            const keywords = metaMap.get(cleanTmdbId) || [];
            for (const kwObj of keywords) {
                const kwStr = (typeof kwObj === 'object' && kwObj !== null ? (kwObj.name || '') : String(kwObj)).toLowerCase();
                const targetL1 = graph.data?.kw_to_L1?.[kwStr];
                if (targetL1) {
                    l1HeatMap[targetL1] = (l1HeatMap[targetL1] || 0) + weight;
                }
            }
        } else if (swipe.action === 'dislike' && swipe._graphNodeId) {
            const nodeId = swipe._graphNodeId;
            if (graph.data?.L1?.[nodeId]) {
                l1HeatMap[nodeId] = (l1HeatMap[nodeId] || 0) - 0.5;
            } else if (graph.data?.L2?.[nodeId]) {
                const children = graph.data.L2[nodeId]?.children_L1 || [];
                for (const childL1 of children) {
                    l1HeatMap[childL1] = (l1HeatMap[childL1] || 0) - 0.5;
                }
            }
        }
    }
    
    // Cerchiamo i cluster più caldi nel livello che stiamo analizzando (es. se nextLevel = L1)
    let hotNodes = [];
    if (nextLevelStr === 'L1') {
        for (const [l1_id, score] of Object.entries(l1HeatMap)) {
            if (score > 0 && graph.data?.L1?.[l1_id]) hotNodes.push({ id: l1_id, score });
        }
    } else {
        // Se nextLevel è L2 (strano, solitamente si parte da L2), aggreghiamo il calore L1 ai padri L2
        const l2HeatMap = {};
        for (const [l1_id, score] of Object.entries(l1HeatMap)) {
            const l2_id = graph.data.L1[l1_id]?.parent;
            if (l2_id) l2HeatMap[l2_id] = (l2HeatMap[l2_id] || 0) + score;
        }
        for (const [l2_id, score] of Object.entries(l2HeatMap)) {
            if (score > 0 && graph.data?.L2?.[l2_id]) hotNodes.push({ id: l2_id, score });
        }
    }
    
    hotNodes.sort((a, b) => b.score - a.score);
    const topHotNodes = hotNodes.slice(0, 5).map(n => {
        const nodeObj = graph.data[nextLevelStr]?.[n.id];
        const name = nodeObj?.ui_name || nodeObj?.medoid || nodeObj?.name || 'Unknown';
        return { id: n.id, name, score: n.score };
    });
    console.log(`[MatchmakerGraphEngine] Computed Hot Nodes:`, topHotNodes);
    
    // Selezioniamo i top 4
    let selectedNodes = hotNodes.slice(0, 4).map(n => n.id);
    
    // Fallback se nessun Like
    if (selectedNodes.length === 0) {
        console.log(`[MatchmakerGraphEngine] Heat Map empty (no likes?), picking random nodes from ${nextLevelStr}`);
        const allNodes = Object.keys(graph.data[nextLevelStr] || {});
        selectedNodes = allNodes.sort(() => 0.5 - Math.random()).slice(0, 4);
    }
    const winningNode = selectedNodes.length > 0 ? selectedNodes[0] : null;
    
    const cards = await getCardsForNodes(selectedNodes, nextLevelStr, 3, mediaType, filters, history);
    console.log(`[MatchmakerGraphEngine] Next cards ready: ${cards.length} cards for nextLevel ${nextLevelStr}`);
    return { isFinal: false, nextLevel: nextLevelStr, cards, winningNode };
}

/**
 * ATTO 3: Finale
 */
async function getFinalRecommendations(winningNodesArray, mediaType, filters) {
    if (!winningNodesArray || winningNodesArray.length === 0) return [];
    
    const kwStrs = new Set();
    for (const winningNode of winningNodesArray) {
        let level = 'L1';
        if (winningNode.startsWith('t_')) level = 'L2';
        else if (winningNode.startsWith('v_')) level = 'L3';
        else if (winningNode.startsWith('m_')) level = 'L4';
        else if (winningNode.startsWith('r_')) level = 'L5';
        
        const map = getKeywordsForNodes([winningNode], level);
        const arr = map.get(winningNode) || [];
        arr.forEach(k => kwStrs.add(k));
    }
    
    if (kwStrs.size === 0) return [];
    
    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const preset = {
        type: types,
        where: [ F.minVotes(30) ],
        orderBy: S.POPULAR
    };
    
    applyFunnelFiltersToPreset(preset, filters);
    
    const safeStrs = Array.from(kwStrs).slice(0, 30).map(s => s.replace(/'/g, "''"));
    preset.where.push(`(${safeStrs.map(s => `"keywords" ILIKE '%"${s}"%'`).join(' OR ')})`);
    
    const lightMetas = await getDuckDbCatalogFromPreset(preset, 0, 100);
    return lightMetas.map(m => String(m._tmdbId || m.id).replace(/^[a-zA-Z]+:/, ''));
}

module.exports = {
    getMatchmakerInitCards,
    getMatchmakerNextCards,
    getFinalRecommendations,
    getKeywordsForNodes
};
