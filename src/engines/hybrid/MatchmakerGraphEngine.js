const graph = require('../graph/HierarchicalGraph');
const { getDuckDbCatalogFromFilters } = require('../../catalog/providers/DuckDbProvider');

// Livelli: L5 (Root) -> L4 (Macro Genere) -> L3 (Macro Vibe) -> L2 (Topos) -> L1 (Micro Cluster)
const LEVELS = ['L5', 'L4', 'L3', 'L2', 'L1'];

function getLevelChildren(level, nodeId) {
    if (!graph.isLoaded || !graph.data) return [];
    
    // Es. se siamo a L4 ('m_1'), children sono L3
    if (level === 'L5') {
        // L5 = r_x. Trova tutti gli m_x (L4) il cui parent è r_x
        return Object.keys(graph.data.L4).filter(k => graph.data.L4[k].parent === nodeId);
    }
    if (level === 'L4') {
        return Object.keys(graph.data.L3).filter(k => graph.data.L3[k].parent === nodeId);
    }
    if (level === 'L3') {
        return Object.keys(graph.data.L2).filter(k => graph.data.L2[k].parent === nodeId);
    }
    if (level === 'L2') {
        return graph.data.L2[nodeId]?.children_L1 || [];
    }
    return [];
}

function getKeywordsForNodes(nodeIds, level) {
    if (!graph.isLoaded || !graph.data) return new Map();
    
    const nodeKeywords = new Map(); // nodeId -> [kwId, kwId, ...]
    
    for (const nodeId of nodeIds) {
        const kwIds = new Set();
        
        // Risaliamo fino a L1 per raccogliere le keyword
        let l1s = [];
        if (level === 'L1') {
            l1s = [nodeId];
        } else if (level === 'L2') {
            l1s = graph.data.L2[nodeId]?.children_L1 || [];
        } else if (level === 'L3') {
            const l2s = Object.keys(graph.data.L2).filter(k => graph.data.L2[k].parent === nodeId);
            for (const l2 of l2s) l1s.push(...(graph.data.L2[l2]?.children_L1 || []));
        } else if (level === 'L4') {
            const l3s = Object.keys(graph.data.L3).filter(k => graph.data.L3[k].parent === nodeId);
            for (const l3 of l3s) {
                const l2s = Object.keys(graph.data.L2).filter(k => graph.data.L2[k].parent === l3);
                for (const l2 of l2s) l1s.push(...(graph.data.L2[l2]?.children_L1 || []));
            }
        } else if (level === 'L5') {
            const l4s = Object.keys(graph.data.L4).filter(k => graph.data.L4[k].parent === nodeId);
            for (const l4 of l4s) {
                const l3s = Object.keys(graph.data.L3).filter(k => graph.data.L3[k].parent === l4);
                for (const l3 of l3s) {
                    const l2s = Object.keys(graph.data.L2).filter(k => graph.data.L2[k].parent === l3);
                    for (const l2 of l2s) l1s.push(...(graph.data.L2[l2]?.children_L1 || []));
                }
            }
        }
        
        // Map L1 -> keywords
        for (const l1 of l1s) {
            for (const [kwId, targetL1] of Object.entries(graph.data.kw_to_L1 || {})) {
                if (targetL1 === l1) kwIds.add(kwId);
            }
        }
        
        let kwArray = Array.from(kwIds);
        // Limitiamo a 30 per query DuckDB veloce
        if (kwArray.length > 30) kwArray = kwArray.sort(() => 0.5 - Math.random()).slice(0, 30);
        
        nodeKeywords.set(nodeId, kwArray);
    }
    
    return nodeKeywords;
}

async function getCardsForNodes(nodeIds, currentLevel, cardsPerNode, mediaType) {
    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const nodeKeywords = getKeywordsForNodes(nodeIds, currentLevel);
    
    let allCards = [];
    
    for (const [nodeId, kwIds] of nodeKeywords.entries()) {
        if (kwIds.length === 0) continue;
        
        const filters = {
            with_keywords: kwIds.join('|'),
            'vote_count.gte': 100, // Non peschiamo roba troppo oscura per il matchmaker
            sort_by: 'popularity.desc'
        };
        
        const lightMetas = await getDuckDbCatalogFromFilters(filters, types, 0, cardsPerNode * 3, {});
        
        // Shuffle e prendi i primi N
        const shuffled = lightMetas.sort(() => 0.5 - Math.random()).slice(0, cardsPerNode);
        
        const mappedCards = shuffled.map(c => ({
            id: String(c._tmdbId),
            title: c.name,
            poster: c.poster,
            year: c.releaseInfo,
            overview: c.description,
            genre_ids: c.rawTMDB?.genre_ids || [],
            type: types,
            _graphNodeId: nodeId,
            _graphLevel: currentLevel
        }));
        
        allCards.push(...mappedCards);
    }
    
    return allCards.sort(() => 0.5 - Math.random());
}

/**
 * Inizializza il matchmaker. Sceglie 2 nodi L4 casuali e genera le carte.
 */
async function getMatchmakerInitCards(mediaType) {
    if (!graph.isLoaded || !graph.data) return [];
    
    // Scegliamo 2-3 Macro-Generi L4 casuali
    const l4Nodes = Object.keys(graph.data.L4 || {});
    if (l4Nodes.length === 0) return [];
    
    let selectedL4s = l4Nodes.sort(() => 0.5 - Math.random()).slice(0, 3);
    
    // Per ogni L4, otteniamo 4 carte
    return await getCardsForNodes(selectedL4s, 'L4', 4, mediaType);
}

/**
 * Determina il nodo vincitore e scende di un livello
 */
async function getMatchmakerNextCards(mediaType, history, currentLevelStr) {
    const levelIdx = LEVELS.indexOf(currentLevelStr);
    
    if (levelIdx >= LEVELS.length - 1) {
        // Siamo già a L1, non possiamo scendere ulteriormente
        return { isFinal: true, cards: [] };
    }
    
    const nextLevelStr = LEVELS[levelIdx + 1];
    
    // Tally i 'like' nella history per i nodi del livello corrente
    const nodeScores = {};
    for (const swipe of history) {
        if (swipe.action === 'like' || swipe.action === 'watchlist') {
            const nId = swipe._graphNodeId;
            if (nId) {
                nodeScores[nId] = (nodeScores[nId] || 0) + (swipe.action === 'watchlist' ? 2 : 1);
            }
        } else if (swipe.action === 'dislike') {
            const nId = swipe._graphNodeId;
            if (nId) nodeScores[nId] = (nodeScores[nId] || 0) - 0.5;
        }
    }
    
    // Trova il nodo vincitore
    let winningNode = null;
    let maxScore = -999;
    for (const [nId, score] of Object.entries(nodeScores)) {
        if (score > maxScore) {
            maxScore = score;
            winningNode = nId;
        }
    }
    
    // Se non ci sono like, restiamo sullo stesso livello ma peschiamo nuovi nodi
    if (!winningNode || maxScore <= 0) {
        const allNodes = Object.keys(graph.data[currentLevelStr] || {});
        let newNodes = allNodes.sort(() => 0.5 - Math.random()).slice(0, 3);
        const cards = await getCardsForNodes(newNodes, currentLevelStr, 4, mediaType);
        return { isFinal: false, nextLevel: currentLevelStr, cards, winningNode: null };
    }
    
    // Scendiamo di livello
    let childrenNodes = getLevelChildren(currentLevelStr, winningNode);
    if (childrenNodes.length === 0) {
        // Se non ha figli, fermiamoci
        return { isFinal: true, cards: [], winningNode };
    }
    
    // Se ha troppi figli (es. > 4), ne scegliamo 4 a caso
    if (childrenNodes.length > 4) {
        childrenNodes = childrenNodes.sort(() => 0.5 - Math.random()).slice(0, 4);
    }
    
    const cards = await getCardsForNodes(childrenNodes, nextLevelStr, 3, mediaType);
    return { isFinal: false, nextLevel: nextLevelStr, cards, winningNode };
}

/**
 * Genera il risultato finale partendo da un nodo (L1 o L2)
 */
async function getFinalRecommendations(winningNode, mediaType) {
    if (!winningNode) return [];
    
    // Risaliamo al livello del winning node per estrarre le keyword
    let level = 'L1';
    if (winningNode.startsWith('t_')) level = 'L2';
    else if (winningNode.startsWith('v_')) level = 'L3';
    else if (winningNode.startsWith('m_')) level = 'L4';
    
    const nodeKeywords = getKeywordsForNodes([winningNode], level);
    const kwIds = nodeKeywords.get(winningNode) || [];
    
    if (kwIds.length === 0) return [];
    
    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const filters = {
        with_keywords: kwIds.join('|'),
        'vote_count.gte': 50,
        sort_by: 'popularity.desc'
    };
    
    const lightMetas = await getDuckDbCatalogFromFilters(filters, types, 0, 100, {});
    return lightMetas.map(m => String(m._tmdbId));
}

module.exports = {
    getMatchmakerInitCards,
    getMatchmakerNextCards,
    getFinalRecommendations
};
