const graph = require('../graph/HierarchicalGraph');
const { getDuckDbCatalogFromPreset, getDuckDbMetaDetails } = require('../../catalog/providers/DuckDbProvider');
const { processTmdbQueryToPreset } = require('../../utils/legacyTmdbAdapter');
const { F } = require('../../data/filters');

const LEVELS = ['L5', 'L4', 'L3', 'L2', 'L1'];

// Mappa concettuale dei Mood -> Keyword strategiche TMDB per l'innesco termico
const MOOD_KEYWORDS_MAP = {
    "Intenso & Ricco d'Azione": ['action', 'thriller', 'survival', 'martial arts', 'superhero', 'explosion', 'shootout', 'violence', 'blood', 'chase', 'murder', 'police', 'revenge'],
    "Rilassante & Leggero": ['feel-good', 'slice of life', 'comedy', 'healing', 'relaxing', 'friendship', 'family', 'vacation', 'peaceful', 'romantic comedy', 'love'],
    "Psicologico & Misterioso": ['mind-bending', 'psychological thriller', 'mystery', 'detective', 'dark', 'plot twist', 'suspense', 'paranoia', 'investigation', 'mind control'],
    "Drammatico & Emozionante": ['tearjerker', 'sad', 'crying', 'melodrama', 'heartbreaking', 'emotional', 'tragedy', 'terminal illness', 'grief', 'loneliness'],
    "Epico & Avventuroso": ['epic', 'journey', 'magic', 'fantasy world', 'space opera', 'adventure', 'quest', 'empire', 'mythology', 'chosen one', 'sword and sorcery']
};

function getLevelChildren(level, nodeId) {
    if (!graph.isLoaded || !graph.data) return [];
    
    if (level === 'L5') return Object.keys(graph.data.L4 || {}).filter(k => graph.data.L4[k].parent === nodeId);
    if (level === 'L4') return Object.keys(graph.data.L3 || {}).filter(k => graph.data.L3[k].parent === nodeId);
    if (level === 'L3') return Object.keys(graph.data.L2 || {}).filter(k => graph.data.L2[k].parent === nodeId);
    if (level === 'L2') return graph.data.L2[nodeId]?.children_L1 || [];
    return [];
}

function getKeywordsForNodes(nodeIds, level) {
    if (!graph.isLoaded || !graph.data) return new Map();
    const nodeKeywords = new Map(); // nodeId -> [kwStr, kwStr, ...]
    
    for (const nodeId of nodeIds) {
        const kwStrs = new Set();
        
        let l1s = [];
        if (level === 'L1') l1s = [nodeId];
        else if (level === 'L2') l1s = graph.data.L2[nodeId]?.children_L1 || [];
        else if (level === 'L3') {
            const l2s = Object.keys(graph.data.L2 || {}).filter(k => graph.data.L2[k].parent === nodeId);
            for (const l2 of l2s) l1s.push(...(graph.data.L2[l2]?.children_L1 || []));
        } else if (level === 'L4') {
            const l3s = Object.keys(graph.data.L3 || {}).filter(k => graph.data.L3[k].parent === nodeId);
            for (const l3 of l3s) {
                const l2s = Object.keys(graph.data.L2 || {}).filter(k => graph.data.L2[k].parent === l3);
                for (const l2 of l2s) l1s.push(...(graph.data.L2[l2]?.children_L1 || []));
            }
        }
        
        for (const l1 of l1s) {
            const l1_node = graph.data.L1[l1];
            if (l1_node && l1_node.keywords) {
                l1_node.keywords.forEach(k => kwStrs.add(k));
            }
        }
        
        let kwArray = Array.from(kwStrs);
        if (kwArray.length > 30) kwArray = kwArray.sort(() => 0.5 - Math.random()).slice(0, 30);
        
        nodeKeywords.set(nodeId, kwArray);
    }
    
    return nodeKeywords;
}



/**
 * Applica i filtri globali del funnel (Anime, Year) al preset
 */
function applyFunnelFiltersToPreset(preset, filters) {
    if (!filters) return;
    if (filters.yearMin) preset.where.push(`"release_date" >= '${filters.yearMin}-01-01'`);
    if (filters.yearMax) preset.where.push(`"release_date" <= '${filters.yearMax}-12-31'`);
    if (filters.isAnime) preset.where.push(F.anime);
    if (filters.genres && filters.genres.length > 0) {
        preset.where.push(F.genreStr(...filters.genres));
    }
}

async function getCardsForNodes(nodeIds, currentLevel, cardsPerNode, mediaType, filters, history = []) {
    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const nodeKeywords = getKeywordsForNodes(nodeIds, currentLevel);
    
    // Estrai gli ID già visti dalla history per evitare duplicati
    const swipedIds = new Set(history.map(s => {
        // history id è "movie:1234" o "series:5678"
        return s.id.split(':')[1];
    }));
    
    let allCards = [];
    for (const [nodeId, kwStrs] of nodeKeywords.entries()) {
        if (kwStrs.length === 0) continue;
        
        // Creiamo il preset a mano perché vogliamo fare match sulle keyword a livello stringa
        const preset = processTmdbQueryToPreset({
            'vote_count.gte': 50,
            sort_by: 'popularity.desc'
        }, types);
        
        applyFunnelFiltersToPreset(preset, filters);
        
        // MATCH STRINGA SU JSON. DuckDB: "keywords" LIKE '%"nome_keyword"%'
        const safeStrs = kwStrs.map(s => s.replace(/'/g, "''"));
        preset.where.push(`(${safeStrs.map(s => `"keywords" LIKE '%"${s}"%'`).join(' OR ')})`);
        
        const lightMetas = await getDuckDbCatalogFromPreset(preset, 0, 100); // Fetch a large pool to avoid exhaustion when filtering swiped cards
        
        // Filtriamo i duplicati
        const filteredMetas = lightMetas.filter(c => !swipedIds.has(String(c.id).replace('tmdb:', '')));
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
    
    let nextLevelStr = LEVELS[levelIdx + 1]; // es. L2 -> L1
    
    // Se siamo già a L1 o oltre, continuiamo a rimanere su L1 all'infinito, 
    // sarà l'utente a decidere quando fermarsi tramite la UI (Salva Catalogo)
    if (levelIdx >= LEVELS.length - 1 || currentLevelStr === 'L1') {
        nextLevelStr = 'L1';
    }
    
    console.log(`[MatchmakerGraphEngine] Target Next Level: ${nextLevelStr}`);
    
    const l1HeatMap = {};
    for (const swipe of history) {
        if (swipe.action === 'like' || swipe.action === 'watchlist') {
            const weight = swipe.action === 'watchlist' ? 2 : 1;
            const tmdbId = swipe.id.split(':')[1];
            
            const meta = await getDuckDbMetaDetails(tmdbId, mediaType);
            if (meta && meta.rawTMDB && meta.rawTMDB.keywords && meta.rawTMDB.keywords.results) {
                for (const kwObj of meta.rawTMDB.keywords.results) {
                    const kwStr = kwObj.name.toLowerCase();
                    const targetL1 = graph.data.kw_to_L1?.[kwStr];
                    if (targetL1) {
                        l1HeatMap[targetL1] = (l1HeatMap[targetL1] || 0) + weight;
                    }
                }
            }
        } else if (swipe.action === 'dislike' && swipe._graphNodeId) {
            // Penalità diretta
            l1HeatMap[swipe._graphNodeId] = (l1HeatMap[swipe._graphNodeId] || 0) - 0.5;
        }
    }
    
    // Cerchiamo i cluster più caldi nel livello che stiamo analizzando (es. se nextLevel = L1)
    let hotNodes = [];
    if (nextLevelStr === 'L1') {
        for (const [l1_id, score] of Object.entries(l1HeatMap)) {
            if (score > 0) hotNodes.push({ id: l1_id, score });
        }
    } else {
        // Se nextLevel è L2 (strano, solitamente si parte da L2), aggreghiamo il calore L1 ai padri L2
        const l2HeatMap = {};
        for (const [l1_id, score] of Object.entries(l1HeatMap)) {
            const l2_id = graph.data.L1[l1_id]?.parent;
            if (l2_id) l2HeatMap[l2_id] = (l2HeatMap[l2_id] || 0) + score;
        }
        for (const [l2_id, score] of Object.entries(l2HeatMap)) {
            if (score > 0) hotNodes.push({ id: l2_id, score });
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
    let winningNode = selectedNodes.length > 0 ? selectedNodes[0] : null;
    if (selectedNodes.length === 0) {
        console.log(`[MatchmakerGraphEngine] Heat Map empty (no likes?), picking random nodes from ${nextLevelStr}`);
        const allNodes = Object.keys(graph.data[nextLevelStr] || {});
        selectedNodes = allNodes.sort(() => 0.5 - Math.random()).slice(0, 4);
    }
    
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
        
        const map = getKeywordsForNodes([winningNode], level);
        const arr = map.get(winningNode) || [];
        arr.forEach(k => kwStrs.add(k));
    }
    
    if (kwStrs.size === 0) return [];
    
    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const preset = processTmdbQueryToPreset({
        'vote_count.gte': 30,
        sort_by: 'popularity.desc'
    }, types);
    
    applyFunnelFiltersToPreset(preset, filters);
    
    const safeStrs = Array.from(kwStrs).slice(0, 30).map(s => s.replace(/'/g, "''"));
    preset.where.push(`(${safeStrs.map(s => `"keywords" LIKE '%"${s}"%'`).join(' OR ')})`);
    
    const lightMetas = await getDuckDbCatalogFromPreset(preset, 0, 100);
    return lightMetas.map(m => String(m.id).replace('tmdb:', ''));
}

module.exports = {
    getMatchmakerInitCards,
    getMatchmakerNextCards,
    getFinalRecommendations
};
