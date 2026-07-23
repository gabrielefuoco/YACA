const fs = require('fs');
const path = require('path');
const LRUCache = require('../../utils/LRUCache');

class HierarchicalGraph {
    constructor() {
        this.data = null;
        this.isLoaded = false;
        this.singleKwCache = new LRUCache({ max: 5000 });
        this.arrayVectorCache = new LRUCache({ max: 2000 });
        this.loadData();
    }

    loadData() {
        if (this.isLoaded) return;
        try {
            const dataPath = path.join(__dirname, '../../data/hierarchical_graph.json');
            if (fs.existsSync(dataPath)) {
                this.data = require(dataPath);
                this.isLoaded = true;
                console.log('[HierarchicalGraph] Grafo gerarchico caricato in RAM con successo.');
            } else {
                console.warn('[HierarchicalGraph] File hierarchical_graph.json non trovato. Grafo non disponibile.');
                this.data = { kw_to_L1: {}, L1: {}, L2: {}, L3: {} };
            }
        } catch (err) {
            console.error('[HierarchicalGraph] Errore nel caricamento del grafo:', err);
            this.data = { kw_to_L1: {}, L1: {}, L2: {}, L3: {} };
        }
    }

    /**
     * Trasforma le keyword raw di un film in un vettore sparso gerarchico con memoization LRU O(1)
     * @param {Array} tmdbKeywordsArray Array di oggetti keyword (es. [{id: 123}, {id: 456}]) o interi
     * @returns {Object} Vettore sparso, es. { "k:123": 1.0, "L1:c_1": 1.0, "L2:t_5": 0.5, "L3:v_1": 0.1 }
     */
    vectorizeKeywords(tmdbKeywordsArray) {
        if (!tmdbKeywordsArray || !Array.isArray(tmdbKeywordsArray) || tmdbKeywordsArray.length === 0) {
            return {};
        }

        // Costruisci una chiave di cache deterministica
        const keyParts = [];
        for (const kw of tmdbKeywordsArray) {
            if (typeof kw === 'object' && kw !== null) {
                if (kw.id) keyParts.push(String(kw.id));
                else if (kw.name) keyParts.push(String(kw.name).toLowerCase().trim());
            } else {
                keyParts.push(String(kw).toLowerCase().trim());
            }
        }
        const cacheKey = keyParts.sort().join('|');
        if (cacheKey && this.arrayVectorCache.has(cacheKey)) {
            return { ...this.arrayVectorCache.get(cacheKey) };
        }

        const vector = {};

        for (const kw of tmdbKeywordsArray) {
            let kwId = null;
            let kwStr = null;

            if (typeof kw === 'object' && kw !== null) {
                kwId = kw.id ? String(kw.id) : null;
                kwStr = kw.name ? String(kw.name).toLowerCase().trim() : null;
            } else {
                const s = String(kw).toLowerCase().trim();
                if (/^\d+$/.test(s)) {
                    kwId = s;
                } else {
                    kwStr = s;
                }
            }

            const singleKey = kwId ? `id:${kwId}` : (kwStr ? `str:${kwStr}` : null);
            if (singleKey && this.singleKwCache.has(singleKey)) {
                const singleVec = this.singleKwCache.get(singleKey);
                for (const [node, weight] of Object.entries(singleVec)) {
                    vector[node] = (vector[node] || 0) + weight;
                }
                continue;
            }

            const singleVec = {};
            // Nodo L0 (Keyword Grezza)
            if (kwId) singleVec[`k:${kwId}`] = 1.0;
            if (kwStr) singleVec[`k:${kwStr}`] = 1.0;
            
            if (this.isLoaded) {
                const l1Id = (kwStr && this.data.kw_to_L1[kwStr]) || (kwId && this.data.kw_to_L1[kwId]) || null;
                if (l1Id) {
                    // Nodo L1 (Micro-Cluster)
                    singleVec[`L1:${l1Id}`] = (singleVec[`L1:${l1Id}`] || 0) + 1.0;

                    // Diffusione Orizzontale (L1 Adjacency)
                    const adj = this.data.L1_adjacency?.[l1Id];
                    if (adj) {
                        const neighbors = Object.entries(adj).sort((a, b) => b[1] - a[1]).slice(0, 10);
                        if (neighbors.length > 0) {
                            const maxWeight = neighbors[0][1]; 
                            for (const [neighborId, rawWeight] of neighbors) {
                                const relativeWeight = (rawWeight / maxWeight) * 0.6;
                                singleVec[`L1:${neighborId}`] = (singleVec[`L1:${neighborId}`] || 0) + relativeWeight;
                            }
                        }
                    }
                    
                    // Nodo L2 (Topos Narrativo)
                    const l2Id = this.data.L1[l1Id]?.parent;
                    if (l2Id) {
                        singleVec[`L2:${l2Id}`] = (singleVec[`L2:${l2Id}`] || 0) + 0.5;
                        
                        // Nodo L3 (Macro-Vibe)
                        const l3Id = this.data.L2[l2Id]?.parent;
                        if (l3Id) {
                            singleVec[`L3:${l3Id}`] = (singleVec[`L3:${l3Id}`] || 0) + 0.1;
                            
                            // Nodo L4 (Macro-Genere)
                            const l4Id = this.data.L3[l3Id]?.parent;
                            if (l4Id) {
                                singleVec[`L4:${l4Id}`] = (singleVec[`L4:${l4Id}`] || 0) + 0.05;
                                
                                // Nodo L5 (Radice)
                                const l5Id = this.data.L4?.[l4Id]?.parent;
                                if (l5Id) {
                                    singleVec[`L5:${l5Id}`] = (singleVec[`L5:${l5Id}`] || 0) + 0.01;
                                }
                            }
                        }
                    }
                }
            }

            if (singleKey) {
                this.singleKwCache.set(singleKey, singleVec);
            }

            for (const [node, weight] of Object.entries(singleVec)) {
                vector[node] = (vector[node] || 0) + weight;
            }
        }
        
        if (cacheKey) {
            this.arrayVectorCache.set(cacheKey, vector);
        }

        return { ...vector };
    }
}

// Esportiamo un'istanza singoletto per condividere la cache JSON in memoria
const instance = new HierarchicalGraph();
module.exports = instance;
