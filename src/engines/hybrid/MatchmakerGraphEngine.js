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
 * ATTO 1: IL FUNNEL (L4 -> L3)
 * Motore Matematico VSM (Jaccard + Mass Penalty + Mood Bubble-up)
 */
function calculateMatchmakerFunnel(genres, moods, filters) {
    console.log('[MatchmakerGraphEngine] 🔵 STARTING FUNNEL 🔵');
    console.log('[MatchmakerGraphEngine] Inputs -> Genres:', genres, '| Moods:', moods, '| Filters:', filters);

    if (!graph.isLoaded || !graph.data) {
        console.warn('[MatchmakerGraphEngine] Graph not loaded!');
        return [];
    }
    
    let moodKeywords = [];
    if (moods && moods.length > 0) {
        moods.forEach(m => {
            if (MOOD_KEYWORDS_MAP[m]) moodKeywords.push(...MOOD_KEYWORDS_MAP[m]);
        });
    }
    const moodSet = new Set(moodKeywords);
    console.log('[MatchmakerGraphEngine] Mood Keywords Set Size:', moodSet.size);
    
    // Bubble-Up termico da L2
    const bubbleUpBoosts = {};
    if (moodSet.size > 0) {
        for (const [l2_id, l2_data] of Object.entries(graph.data.L2 || {})) {
            let intersectScore = 0;
            const topKws = l2_data.top_keywords || [];
            for (const kw of topKws) {
                if (moodSet.has(kw.name)) intersectScore += 1;
            }
            if (l2_data.children_L1) {
                for (const l1_id of l2_data.children_L1) {
                    const l1_data = graph.data.L1[l1_id];
                    if (l1_data && l1_data.keywords) {
                        for (const kw of l1_data.keywords) {
                            if (moodSet.has(kw)) intersectScore += 0.5;
                        }
                    }
                }
            }
            if (intersectScore > 0 && l2_data.parent) {
                bubbleUpBoosts[l2_data.parent] = (bubbleUpBoosts[l2_data.parent] || 0) + intersectScore;
            }
        }
    }
    
    const results = [];
    for (const [m_id, m_data] of Object.entries(graph.data.L3 || {})) {
        if (m_data.nsfw || m_data.is_nsfw) continue;
        
        // Calcolo Massa
        let totalKeywords = 0;
        if (m_data.children_L2) {
            for (const l2 of m_data.children_L2) {
                const l2_node = graph.data.L2[l2];
                if (l2_node && l2_node.children_L1) {
                    for (const l1 of l2_node.children_L1) {
                        const l1_node = graph.data.L1[l1];
                        if (l1_node && l1_node.keywords) totalKeywords += l1_node.keywords.length;
                    }
                }
            }
        }
        
        let score = 0;
        const dist = m_data.genre_distribution || {};
        let matchCount = 0;
        for (const g of (genres || [])) {
            if (dist[g] && dist[g] > 0.01) { 
                score += dist[g];
                matchCount++;
            }
        }
        
        if (genres && genres.length > 0) score = score * (matchCount / genres.length);
        else score = 1.0;
        
        const massBonus = Math.min(1.0, Math.log10(Math.max(2, totalKeywords)) / 2.0);
        score = score * massBonus;
        
        if (bubbleUpBoosts[m_id]) {
            score *= (1.0 + (bubbleUpBoosts[m_id] * 0.1));
        }
        
        if (genres && genres.length > 0 && score === 0) continue;
        
        results.push({
            id: m_id,
            l4_id: m_data.parent,
            name: m_data.ui_name || m_data.medoid,
            emoji: m_data.ui_emoji || "✨",
            score: score,
            top_genres: m_data.inferred_genres ? m_data.inferred_genres.join(', ') : ''
        });
    }
    
    const grouped = {};
    for (const r of results) {
        if (!grouped[r.l4_id]) {
            const l4_node = graph.data.L4[r.l4_id];
            grouped[r.l4_id] = {
                l4_id: r.l4_id,
                name: l4_node?.ui_name || l4_node?.medoid || "Mix",
                emoji: l4_node?.ui_emoji || "🔥",
                children_l3: []
            };
        }
        grouped[r.l4_id].children_l3.push(r);
    }
    
    for (const l4_id in grouped) {
        grouped[l4_id].children_l3.sort((a, b) => b.score - a.score);
        grouped[l4_id].children_l3 = grouped[l4_id].children_l3.slice(0, 4); // Limit to top 4 L3 per L4
    }
    
    const finalArray = Object.values(grouped).sort((a, b) => {
        const maxA = a.children_l3.length > 0 ? a.children_l3[0].score : 0;
        const maxB = b.children_l3.length > 0 ? b.children_l3[0].score : 0;
        return maxB - maxA;
    });
    
    const finalResults = finalArray.slice(0, 4); // Limit to top 4 L4 clusters
    console.log(`[MatchmakerGraphEngine] Funnel Results: returned ${finalResults.length} L4 clusters`);
    return finalResults;
}

/**
 * Applica i filtri globali del funnel (Anime, Year) al preset
 */
function applyFunnelFiltersToPreset(preset, filters) {
    if (!filters) return;
    if (filters.yearMin) preset.where.push(`"release_date" >= '${filters.yearMin}-01-01'`);
    if (filters.yearMax) preset.where.push(`"release_date" <= '${filters.yearMax}-12-31'`);
    if (filters.isAnime) preset.where.push(F.anime);
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
        
        const lightMetas = await getDuckDbCatalogFromPreset(preset, 0, cardsPerNode * 5); // Fetch more to account for filters
        
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
 * ATTO 2: Inizializzazione Tinder Game
 */
async function getMatchmakerInitCards(mediaType, startingL3NodeId, filters) {
    console.log(`[MatchmakerGraphEngine] 🟢 INIT TINDER GAME 🟢`);
    console.log(`[MatchmakerGraphEngine] Type: ${mediaType} | Starting L3: ${startingL3NodeId} | Filters:`, filters);

    if (!graph.isLoaded || !graph.data) {
        console.warn('[MatchmakerGraphEngine] Graph not loaded during init!');
        return [];
    }
    
    let l2Nodes = [];
    if (startingL3NodeId) {
        l2Nodes = getLevelChildren('L3', startingL3NodeId);
        console.log(`[MatchmakerGraphEngine] Found ${l2Nodes.length} L2 nodes for L3 parent ${startingL3NodeId}`);
    }
    
    if (l2Nodes.length === 0) {
        // Fallback L4 a caso se L3 non trovato
        console.warn(`[MatchmakerGraphEngine] Fallback: startingL3NodeId not found or empty. Using random L4.`);
        const l4Nodes = Object.keys(graph.data.L4 || {});
        if (l4Nodes.length === 0) return [];
        const randomL4 = l4Nodes.sort(() => 0.5 - Math.random())[0];
        const randomL3s = getLevelChildren('L4', randomL4);
        if (randomL3s.length > 0) l2Nodes = getLevelChildren('L3', randomL3s[0]);
    }
    
    const selectedL2s = l2Nodes.sort(() => 0.5 - Math.random()).slice(0, 4);
    const cards = await getCardsForNodes(selectedL2s, 'L2', 3, mediaType, filters);
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
    console.log(`[MatchmakerGraphEngine] Computed Hot Nodes:`, hotNodes.slice(0, 5));
    
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
    calculateMatchmakerFunnel,
    getMatchmakerInitCards,
    getMatchmakerNextCards,
    getFinalRecommendations
};
