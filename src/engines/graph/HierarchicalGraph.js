const fs = require('fs');
const path = require('path');

class HierarchicalGraph {
    constructor() {
        this.data = null;
        this.isLoaded = false;
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
     * Trasforma le keyword raw di un film in un vettore sparso gerarchico
     * @param {Array} tmdbKeywordsArray Array di oggetti keyword (es. [{id: 123}, {id: 456}]) o interi
     * @returns {Object} Vettore sparso, es. { "k:123": 1.0, "L1:c_1": 1.0, "L2:t_5": 0.5, "L3:v_1": 0.1 }
     */
    vectorizeKeywords(tmdbKeywordsArray) {
        const vector = {};
        if (!tmdbKeywordsArray || !Array.isArray(tmdbKeywordsArray)) return vector;

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

            // Nodo L0 (Keyword Grezza)
            if (kwId) vector[`k:${kwId}`] = 1.0;
            if (kwStr) vector[`k:${kwStr}`] = 1.0;
            
            if (!this.isLoaded) continue;

            const l1Id = (kwStr && this.data.kw_to_L1[kwStr]) || (kwId && this.data.kw_to_L1[kwId]) || null;
            if (!l1Id) continue;
            
            // Nodo L1 (Micro-Cluster)
            vector[`L1:${l1Id}`] = (vector[`L1:${l1Id}`] || 0) + 1.0;

            // Diffusione Orizzontale (L1 Adjacency)
            const adj = this.data.L1_adjacency?.[l1Id];
            if (adj) {
                // Prendiamo i top 10 vicini più forti per mantenere il vettore leggero ma catturare bene le influenze incrociate
                const neighbors = Object.entries(adj).sort((a, b) => b[1] - a[1]).slice(0, 10);
                if (neighbors.length > 0) {
                    const maxWeight = neighbors[0][1]; 
                    for (const [neighborId, rawWeight] of neighbors) {
                        // Normalizziamo il peso relativo al vicino più forte.
                        // Il decadimento massimo è 0.6 (60% di un match diretto) per non sovrastare l'L1 reale.
                        const relativeWeight = (rawWeight / maxWeight) * 0.6;
                        vector[`L1:${neighborId}`] = (vector[`L1:${neighborId}`] || 0) + relativeWeight;
                    }
                }
            }
            
            // Nodo L2 (Topos Narrativo)
            const l2Id = this.data.L1[l1Id]?.parent;
            if (l2Id) {
                vector[`L2:${l2Id}`] = (vector[`L2:${l2Id}`] || 0) + 0.5;
                
                // Nodo L3 (Macro-Vibe)
                const l3Id = this.data.L2[l2Id]?.parent;
                if (l3Id) {
                    vector[`L3:${l3Id}`] = (vector[`L3:${l3Id}`] || 0) + 0.1;
                    
                    // Nodo L4 (Macro-Genere)
                    const l4Id = this.data.L3[l3Id]?.parent;
                    if (l4Id) {
                        vector[`L4:${l4Id}`] = (vector[`L4:${l4Id}`] || 0) + 0.05;
                        
                        // Nodo L5 (Radice)
                        const l5Id = this.data.L4?.[l4Id]?.parent;
                        if (l5Id) {
                            vector[`L5:${l5Id}`] = (vector[`L5:${l5Id}`] || 0) + 0.01;
                        }
                    }
                }
            }
        }
        
        return vector;
    }
}

// Esportiamo un'istanza singoletto per condividere la cache JSON in memoria
const instance = new HierarchicalGraph();
module.exports = instance;
