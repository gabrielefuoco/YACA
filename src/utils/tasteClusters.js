/**
 * src/utils/tasteClusters.js
 *
 * Scoring multi-vettore (mixture of tastes) nello spazio sparso del DNA:
 * - Clustering dei segnali nello stesso spazio sparso del DNA (generi/keyword/topoi)
 * - Similarità coseno tra i vettori DNA degli item segnalati
 * - K-means deterministico (seed fisso, ordine stabile dei cluster, k = 3-5)
 * - Guardie: cold start (< 12 segnali -> vettore singolo), isteresi su recompute
 */

const { applyLogSaturation, applySoftRarity } = require('./dnaRarity');

const MIN_SIGNALS_FOR_CLUSTERING = 12;
const MAX_K = 5;
const MIN_K = 3;

/**
 * Calcola la norma euclidea (L2) di un vettore sparso.
 * @param {Record<string, number>} vec
 * @returns {number}
 */
function sparseNorm(vec) {
    if (!vec) return 0;
    let sumSq = 0;
    for (const val of Object.values(vec)) {
        const n = Number(val) || 0;
        sumSq += n * n;
    }
    return Math.sqrt(sumSq);
}

/**
 * Normalizza un vettore sparso alla norma L2 unitaria.
 * @param {Record<string, number>} vec
 * @returns {Record<string, number>}
 */
function sparseUnitNormalize(vec) {
    const norm = sparseNorm(vec);
    if (norm === 0) return {};
    const res = {};
    for (const [k, v] of Object.entries(vec)) {
        const val = Number(v) || 0;
        if (val !== 0) {
            res[k] = val / norm;
        }
    }
    return res;
}

/**
 * Calcola la similarità coseno tra due vettori sparsi.
 * Se uno dei due ha norma 0, ritorna 0.
 * @param {Record<string, number>} vecA
 * @param {Record<string, number>} vecB
 * @returns {number} Valore in [-1, 1] (tipicamente [0, 1] per DNA positivo)
 */
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB) return 0;
    const keysA = Object.keys(vecA);
    const keysB = Object.keys(vecB);
    if (keysA.length === 0 || keysB.length === 0) return 0;

    // Itera sul vettore più corto
    const [shortVec, longVec] = keysA.length <= keysB.length ? [vecA, vecB] : [vecB, vecA];
    let dot = 0;
    for (const [k, val] of Object.entries(shortVec)) {
        if (longVec[k] !== undefined) {
            dot += (Number(val) || 0) * (Number(longVec[k]) || 0);
        }
    }

    const normA = sparseNorm(vecA);
    const normB = sparseNorm(vecB);
    if (normA === 0 || normB === 0) return 0;

    return Math.max(0, Math.min(1, dot / (normA * normB)));
}

/**
 * Determina il numero k di cluster in base al volume di segnali disponibili.
 * @param {number} signalCount
 * @returns {number}
 */
function resolveK(signalCount) {
    if (signalCount < MIN_SIGNALS_FOR_CLUSTERING) return 0;
    if (signalCount >= 35) return 5;
    if (signalCount >= 20) return 4;
    return 3;
}

/**
 * Clusterizza i segnali utente nello spazio sparso del DNA con k-means deterministico.
 *
 * @param {Array<{ tmdbId: number|string, weight: number, itemDna: Record<string, number> }>} items
 * @param {Object} [options]
 * @param {number} [options.k] - Override manuale di k
 * @param {number} [options.minSignals] - Soglia minima segnali (default 12)
 * @param {number} [options.maxIterations] - Massimo numero di iterazioni (default 20)
 * @returns {Array<{ vector: Record<string, number>, mass: number, massShare: number, seeds: number[] }>}
 */
function clusterTasteSignals(items, options = {}) {
    if (!items || !Array.isArray(items) || items.length === 0) {
        return [];
    }

    const minSignals = options.minSignals ?? MIN_SIGNALS_FOR_CLUSTERING;

    // 1. Filtra elementi validi con DNA non vuoto e peso > 0
    const validItems = items
        .filter(item => item && item.tmdbId && item.itemDna && Object.keys(item.itemDna).length > 0 && (Number(item.weight) || 0) > 0)
        .map(item => ({
            tmdbId: Number(item.tmdbId),
            weight: Number(item.weight) || 100,
            itemDna: item.itemDna,
            unitDna: sparseUnitNormalize(item.itemDna)
        }));

    // Guardia Cold Start: sotto la soglia minima si resta a vettore singolo
    if (validItems.length < minSignals) {
        return [];
    }

    // Ordine iniziale canonico deterministico per stabilizzare ogni iterazione
    validItems.sort((a, b) => a.tmdbId - b.tmdbId);

    const targetK = options.k ?? resolveK(validItems.length);
    const k = Math.min(targetK, validItems.length);
    if (k <= 1) {
        return [];
    }

    // 2. Deterministic Seeding (variante deterministica Furthest-Point / k-means++)
    // Seme 1: l'item con peso maggiore (tie-breaker: tmdbId minore)
    let bestFirstIdx = 0;
    let maxWeight = -1;
    for (let i = 0; i < validItems.length; i++) {
        if (validItems[i].weight > maxWeight) {
            maxWeight = validItems[i].weight;
            bestFirstIdx = i;
        }
    }

    const centroidIndices = [bestFirstIdx];
    const centroids = [{ ...validItems[bestFirstIdx].unitDna }];

    // Semi 2..k: seleziona deterministica dell'item che massimizza la distanza minima dai centroidi già scelti
    while (centroids.length < k) {
        let bestCandidateIdx = -1;
        let maxMinDist = -1;

        for (let i = 0; i < validItems.length; i++) {
            if (centroidIndices.includes(i)) continue;
            const item = validItems[i];

            // Distanza = 1 - max(cosSim con i centroidi esistenti)
            let maxSim = 0;
            for (const c of centroids) {
                const sim = cosineSimilarity(item.unitDna, c);
                if (sim > maxSim) maxSim = sim;
            }
            const minDist = 1.0 - maxSim;
            // Pesiamo leggermente per la radice del peso dell'item per evitare outlier marginali
            const candidateScore = minDist * Math.sqrt(item.weight);

            if (candidateScore > maxMinDist) {
                maxMinDist = candidateScore;
                bestCandidateIdx = i;
            }
        }

        if (bestCandidateIdx === -1) break;
        centroidIndices.push(bestCandidateIdx);
        centroids.push({ ...validItems[bestCandidateIdx].unitDna });
    }

    // 3. Iterazioni K-Means
    const maxIterations = options.maxIterations ?? 20;
    let assignments = new Array(validItems.length).fill(-1);

    for (let iter = 0; iter < maxIterations; iter++) {
        let changed = false;

        // Fase di assegnazione
        for (let i = 0; i < validItems.length; i++) {
            const item = validItems[i];
            let bestCluster = 0;
            let bestSim = -1;

            for (let c = 0; c < centroids.length; c++) {
                const sim = cosineSimilarity(item.unitDna, centroids[c]);
                if (sim > bestSim) {
                    bestSim = sim;
                    bestCluster = c;
                }
            }

            if (assignments[i] !== bestCluster) {
                assignments[i] = bestCluster;
                changed = true;
            }
        }

        if (!changed && iter > 0) {
            break;
        }

        // Fase di aggiornamento centroidi
        for (let c = 0; c < centroids.length; c++) {
            const clusterItems = validItems.filter((_, idx) => assignments[idx] === c);
            if (clusterItems.length === 0) {
                continue; // Lascia invariato se vuoto
            }

            const rawCentroid = {};
            for (const item of clusterItems) {
                for (const [key, val] of Object.entries(item.unitDna)) {
                    rawCentroid[key] = (rawCentroid[key] || 0) + (val * item.weight);
                }
            }
            centroids[c] = sparseUnitNormalize(rawCentroid);
        }
    }

    // 4. Costruzione dei cluster finali
    const clusterMap = new Map();
    for (let c = 0; c < centroids.length; c++) {
        clusterMap.set(c, []);
    }
    for (let i = 0; i < validItems.length; i++) {
        const c = assignments[i];
        if (clusterMap.has(c)) {
            clusterMap.get(c).push(validItems[i]);
        }
    }

    const totalSignalsWeight = validItems.reduce((acc, it) => acc + it.weight, 0);
    const clusters = [];

    for (const [cIdx, cItems] of clusterMap.entries()) {
        if (cItems.length === 0) continue;

        const clusterMass = cItems.reduce((acc, it) => acc + it.weight, 0);

        // Estrazione DNA attivo del cluster con saturazione logaritmica e rarità dolce
        const rawClusterDna = {};
        for (const it of cItems) {
            const w = it.weight / 100;
            for (const [key, val] of Object.entries(it.itemDna)) {
                rawClusterDna[key] = (rawClusterDna[key] || 0) + (val * w);
            }
        }

        const saturated = applyLogSaturation(rawClusterDna, 100);
        const withRarity = applySoftRarity(saturated);

        // Normalizzazione a somma 100
        const clusterSum = Object.values(withRarity).reduce((acc, v) => acc + (Number(v) || 0), 0);
        const vector = {};
        if (clusterSum > 0) {
            const factor = 100 / clusterSum;
            for (const [k, v] of Object.entries(withRarity)) {
                vector[k] = Number(((Number(v) || 0) * factor).toFixed(4));
            }
        }

        // Seeds: ordina per peso decrescente, poi per prossimità al centroide del cluster
        const centroid = centroids[cIdx];
        const sortedSeeds = [...cItems].sort((a, b) => {
            if (b.weight !== a.weight) return b.weight - a.weight;
            const simA = cosineSimilarity(a.unitDna, centroid);
            const simB = cosineSimilarity(b.unitDna, centroid);
            if (Math.abs(simB - simA) > 1e-4) return simB - simA;
            return a.tmdbId - b.tmdbId;
        });

        const seeds = sortedSeeds.slice(0, 5).map(it => it.tmdbId);
        const massShare = totalSignalsWeight > 0 ? Number((clusterMass / totalSignalsWeight).toFixed(4)) : 0;

        clusters.push({
            vector,
            mass: Number(clusterMass.toFixed(2)),
            massShare,
            seeds
        });
    }

    if (clusters.length <= 1) {
        return [];
    }

    // 5. Ordine Stabile Determinostico dei Cluster:
    // Ordina per massa decrescente, poi per seed primario minore
    clusters.sort((a, b) => {
        if (b.mass !== a.mass) return b.mass - a.mass;
        const seedA = a.seeds[0] || 0;
        const seedB = b.seeds[0] || 0;
        return seedA - seedB;
    });

    return clusters;
}

/**
 * Guardia di Isteresi: controlla se i segnali sono cambiati in modo sostanziale
 * da richiedere il ricalcolo dei cluster del DNA.
 *
 * @param {Array<Object>|null} existingClusters - Cluster precedentemente salvati
 * @param {Object|null} existingMeta - Metadati del precedente ricalcolo { signalCount, itemIds }
 * @param {Array<{ tmdbId: number|string }>} currentItems - Lista corrente degli item con segnale
 * @returns {boolean} true se è necessario ricalcolare, false se si possono riusare
 */
function shouldRecomputeClusters(existingClusters, existingMeta, currentItems) {
    if (!existingClusters || !Array.isArray(existingClusters) || existingClusters.length === 0) {
        return true;
    }
    if (!existingMeta || !existingMeta.itemIds || typeof existingMeta.signalCount !== 'number') {
        return true;
    }

    const currentIds = (currentItems || [])
        .map(i => Number(i.tmdbId))
        .filter(id => !isNaN(id) && id > 0);

    // Se siamo scesi sotto la soglia minima di clustering, va ricalcolato (per svuotarlo)
    if (currentIds.length < MIN_SIGNALS_FOR_CLUSTERING) {
        return true;
    }

    const prevCount = existingMeta.signalCount;
    const currCount = currentIds.length;
    const diff = Math.abs(currCount - prevCount);

    // Se il conteggio varia di 3 o più segnali, ricalcola
    if (diff >= 3) {
        return true;
    }

    // Calcolo Jaccard sugli ID
    const prevSet = new Set(existingMeta.itemIds.map(Number));
    let intersection = 0;
    for (const id of currentIds) {
        if (prevSet.has(id)) intersection++;
    }
    const unionSize = new Set([...currentIds, ...prevSet]).size;
    const jaccard = unionSize > 0 ? intersection / unionSize : 1.0;

    // Se la similarità Jaccard è inferiore all'85%, ricalcola
    if (jaccard < 0.85) {
        return true;
    }

    // Variazione trascurabile: riusa i cluster esistenti per stabilità del DNA
    return false;
}

module.exports = {
    cosineSimilarity,
    sparseNorm,
    sparseUnitNormalize,
    resolveK,
    clusterTasteSignals,
    shouldRecomputeClusters,
    MIN_SIGNALS_FOR_CLUSTERING,
    MAX_K,
    MIN_K
};
