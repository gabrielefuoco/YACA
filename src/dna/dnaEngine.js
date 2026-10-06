/**
 * src/dna/dnaEngine.js
 *
 * Motore matematico del DNA: modulo **puro, senza I/O** (niente Mongo, DuckDB,
 * HTTP). L'I/O resta in `src/profile/ProfileBuilder.js`, la combinazione
 * bayesiana in `src/profile/ProfileScorer.js`.
 *
 * Contiene, in un unico posto:
 *  1. le utility anti-flat (decadimento temporale, saturazione logaritmica,
 *     rarità dolce, rilevanza rispetto al prior, metriche di flatness) con la
 *     cache df di modulo;
 *  2. il clustering sparso multi-vettore (k-means deterministico + isteresi);
 *  3. l'estrazione e la fusione del DNA (statico, attivo, finale).
 *
 * Dipendenze ammesse: `src/data/keywordIds.js` (foglia) e
 * `src/engines/graph/HierarchicalGraph.js` (grafo in RAM: dipendenza statica
 * della matematica L1-L5). Il call graph resta aciclico.
 *
 * ATTENZIONE: `globalDfCache` è stato di modulo e deve restare **una sola
 * istanza**. `src/db/duckDbStore.js` la inietta attraverso il thin-shim
 * `src/utils/dnaRarity.js`, che punta a questo modulo: se nascesse una seconda
 * cache, la rarità ricadrebbe in silenzio sui fallback stimati.
 */

const { isRetiredTmdbKeywordId } = require('../data/keywordIds');
const HierarchicalGraph = require('../engines/graph/HierarchicalGraph');

// ============================================================================
// 1. Anti-flat: decadimento, saturazione, rarità, flatness
// ============================================================================

const N_DOCS_DEFAULT = 100000;
const DF_MIN_DEFAULT = 15;
const RARITY_ALPHA = 0.35;
const RARITY_MAX_WEIGHT = 1.80;
const COMMON_DF_REF = 30000; // riferimento genere/keyword comune

// Cache in-memory delle frequenze (k -> df), iniettata da duckDbStore.
let globalDfCache = null;

function setGlobalDfCache(cache) {
    globalDfCache = cache;
}

function getGlobalDfCache() {
    return globalDfCache;
}

/**
 * Calcola il fattore di decadimento esponenziale half-life per un segnale.
 * @param {Date|string|number} date Data dell'interazione
 * @param {number} now Timestamp di riferimento (default Date.now())
 * @param {number} halfLifeMonths Emivita in mesi (default 24 mesi)
 * @returns {number} Moltiplicatore in (0, 1]
 */
function computeTimeDecay(date, now = Date.now(), halfLifeMonths = 24) {
    if (!date) return 1.0;
    const t = new Date(date).getTime();
    if (isNaN(t) || t >= now) return 1.0;
    const diffMonths = Math.max(0, (now - t) / (1000 * 60 * 60 * 24 * 30.4375));
    const factor = Math.pow(0.5, diffMonths / halfLifeMonths);
    return Math.max(0.01, factor);
}

/**
 * Applica la saturazione logaritmica a un vettore per prevenire
 * che i gusti dominanti schiaccino i nuovi interessi.
 * f(x) = scale * ln(1 + x / scale)
 * @param {Record<string, number>} vector
 * @param {number} scale
 * @returns {Record<string, number>}
 */
function applyLogSaturation(vector, scale = 100) {
    if (!vector || typeof vector !== 'object') return {};
    const result = {};
    for (const [key, val] of Object.entries(vector)) {
        const num = Number(val) || 0;
        if (num <= 0) continue;
        result[key] = Math.log(1 + (num / scale)) * scale;
    }
    return result;
}

/**
 * Calcola il moltiplicatore di rarità dolce per una data chiave.
 * - soglia minima df = 15 per evitare rumore su keyword spurie
 * - esponente ridotto alpha = 0.35
 * - tetto massimo cap = 1.80
 * @param {string} key Chiave DNA (es. 'g:28', 'k:123', 'L1:c_1')
 * @param {Map<string, number>|Record<string, number>|null} dfMap Mappa df opzionale
 * @returns {number} Moltiplicatore dolce in [1.0, 1.80]
 */
function getSoftRarityMultiplier(key, dfMap = null) {
    const map = dfMap || globalDfCache;
    let df = null;

    if (map) {
        if (map instanceof Map) df = map.get(key);
        else if (typeof map === 'object') df = map[key];
    }

    // Se df non è noto, usa stime prudenti per tipo di prefisso
    if (df === undefined || df === null) {
        if (key.startsWith('g:')) df = 20000;       // generi sono molto frequenti
        else if (key.startsWith('o:')) df = 15000;   // paesi di origine frequenti
        else if (key.startsWith('L5:')) df = 50000;
        else if (key.startsWith('L4:')) df = 20000;
        else if (key.startsWith('L3:')) df = 5000;
        else if (key.startsWith('L2:')) df = 1500;
        else if (key.startsWith('L1:')) df = 400;
        else if (key.startsWith('k:')) df = 150;     // keyword media
        else df = 500;
    }

    const dfNum = Number(df) || DF_MIN_DEFAULT;
    const effectiveDf = Math.max(DF_MIN_DEFAULT, dfNum);

    const idfCommon = Math.log(1 + (N_DOCS_DEFAULT / COMMON_DF_REF));
    const idfCurrent = Math.log(1 + (N_DOCS_DEFAULT / effectiveDf));

    const ratio = Math.max(1.0, idfCurrent / idfCommon);
    const softMultiplier = Math.pow(ratio, RARITY_ALPHA);

    return Math.min(RARITY_MAX_WEIGHT, Math.max(1.0, softMultiplier));
}

/**
 * Applica la rarità dolce a tutte le chiavi di un vettore.
 * @param {Record<string, number>} vector
 * @param {Map<string, number>|Record<string, number>|null} dfMap
 * @returns {Record<string, number>}
 */
function applySoftRarity(vector, dfMap = null) {
    if (!vector || typeof vector !== 'object') return {};
    const result = {};
    for (const [key, val] of Object.entries(vector)) {
        const num = Number(val) || 0;
        if (num <= 0) continue;
        const rarityMult = getSoftRarityMultiplier(key, dfMap);
        result[key] = num * rarityMult;
    }
    return result;
}

/**
 * Calcola il fattore di rilevanza di un item rispetto al prior statico del contesto.
 * Mix 80/20: 80% condizionato alla rilevanza (1.0 se condivide genere/topos, 0.25 altrimenti),
 * 20% libero per consentire deriva organica.
 * @param {Record<string, number>} itemDna
 * @param {Record<string, number>} vStatic
 * @param {string} context
 * @returns {number} Moltiplicatore in [0.40, 1.00]
 */
function calculateProfileRelevance(itemDna, vStatic, context = 'global') {
    if (!context || context === 'global') return 1.0;
    if (!vStatic || typeof vStatic !== 'object' || Object.keys(vStatic).length === 0) return 1.0;

    // Estrae le chiavi del prior statico (generi, L1, keyword con peso positivo)
    const staticKeys = new Set(
        Object.entries(vStatic)
            .filter(([k, v]) => Number(v) > 0 && (k.startsWith('g:') || k.startsWith('L1:') || k.startsWith('k:')))
            .map(([k]) => k)
    );
    if (staticKeys.size === 0) return 1.0;

    // Controlla se l'item condivide almeno un genere o topos/keyword con il prior statico
    let sharesFeature = false;
    for (const key of Object.keys(itemDna || {})) {
        if (staticKeys.has(key)) {
            sharesFeature = true;
            break;
        }
    }

    const relevance = sharesFeature ? 1.0 : 0.25;
    // Mix 80/20: 80% filtrato / 20% libero
    return 0.20 + (0.80 * relevance);
}

/**
 * Calcola le metriche di flatness di un vettore finale DNA:
 * - entropyBits: entropia di Shannon in bit (-sum p * log2(p))
 * - top10Share: frazione del peso totale detenuta dai 10 elementi maggiori
 * - dimensions: numero di chiavi con peso positivo
 * - sum: somma totale dei pesi
 * @param {Record<string, number>} vFinal
 * @returns {{ dimensions: number, sum: number, entropyBits: number, top10Share: number, lastCalculated: Date }}
 */
function calculateFlatnessMetrics(vFinal) {
    if (!vFinal || typeof vFinal !== 'object') {
        return { dimensions: 0, sum: 0, entropyBits: 0, top10Share: 0, lastCalculated: new Date() };
    }
    const values = Object.values(vFinal).map(Number).filter(v => v > 0);
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum === 0) {
        return { dimensions: 0, sum: 0, entropyBits: 0, top10Share: 0, lastCalculated: new Date() };
    }

    let entropyBits = 0;
    for (const val of values) {
        const p = val / sum;
        entropyBits -= p * Math.log2(p);
    }

    const sorted = [...values].sort((a, b) => b - a);
    const top10Sum = sorted.slice(0, 10).reduce((a, b) => a + b, 0);
    const top10Share = top10Sum / sum;

    return {
        dimensions: values.length,
        sum: Number(sum.toFixed(2)),
        entropyBits: Number(entropyBits.toFixed(3)),
        top10Share: Number(top10Share.toFixed(3)),
        lastCalculated: new Date()
    };
}

// ============================================================================
// 2. Clustering sparso multi-vettore (mixture of tastes)
// ============================================================================

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

// ============================================================================
// 3. Estrazione e fusione del DNA
// ============================================================================

function extractStaticDNAFromQueries(queries) {
    const V_static = {};
    const baseWeight = 100; // Peso fisso per le intenzioni iniziali

    if (!queries || !Array.isArray(queries)) return V_static;

    queries.forEach(query => {
        if (query.with_genres) {
            query.with_genres.toString().split(/[,|]/).forEach(id => {
                if (!id.trim()) return;
                const k = `g:${id.trim()}`;
                V_static[k] = (V_static[k] || 0) + baseWeight;
            });
        }
        if (query.with_keywords) {
            const kwIds = query.with_keywords.toString()
                .split(/[,|]/)
                .map(id => id.trim())
                .filter(id => id && !isRetiredTmdbKeywordId(id));
            const hVector = HierarchicalGraph.vectorizeKeywords(kwIds);
            for (const [k, weight] of Object.entries(hVector)) {
                V_static[k] = (V_static[k] || 0) + (baseWeight * weight);
            }
        }
        if (query.keyword) {
            query.keyword.toString().split(/[,|]/).forEach(kwd => {
                if (!kwd.trim()) return;
                const k = `k:${kwd.trim().toLowerCase()}`;
                V_static[k] = (V_static[k] || 0) + baseWeight;
            });
        }
        // NOTA: cast e crew (persone) non entrano nel DNA: lo rendevano troppo restrittivo.
        // Restano solo generi, keyword e paese d'origine.
        if (query.with_origin_country) {
            query.with_origin_country.toString().split(/[,|]/).forEach(id => {
                if (!id.trim()) return;
                const k = `o:${id.trim()}`;
                V_static[k] = (V_static[k] || 0) + baseWeight;
            });
        }

        // Il "Dizionario Rosetta": Traduce i preset Kitsu in DNA TMDB
        if (query.provider === 'kitsu') {
            // Un utente che usa Kitsu sta chiaramente cercando Anime (Genere: Animation = 16)
            V_static['g:16'] = (V_static['g:16'] || 0) + baseWeight;
            // Aggiungiamo anche il paese "JP" per rafforzare l'identità Anime nel DNA
            V_static['o:JP'] = (V_static['o:JP'] || 0) + baseWeight;

            // Se ci sono categorie Kitsu testuali, proviamo a mapparle (es. "isekai")
            if (query._keywordNames) {
                query._keywordNames.split(/[,|]/).forEach(cat => {
                    const cleanCat = cat.trim().toLowerCase();
                    if (!cleanCat) return;
                    // Aggiungiamo la stringa come keyword (k:string).
                    // TMDB e YACA supportano anche DNA su stringhe, non solo ID interi
                    const k = `k:${cleanCat}`;
                    V_static[k] = (V_static[k] || 0) + baseWeight;
                });
            }
        }
    });

    return V_static;
}

function extractActiveDNAFromTmdbData(tmdbData, baseWeight = 100) {
    const dna = {};
    if (!tmdbData) return dna;

    const addKey = (prefix, id) => {
        if (!id) return;
        const k = `${prefix}:${id}`;
        dna[k] = (dna[k] || 0) + baseWeight;
    };

    // Generi (supporta format raw TMDB e le forme normalizzate del parquet DuckDB)
    const genreIds = tmdbData.genre_ids || (tmdbData.genres ? tmdbData.genres.map(g => g.id) : []);
    genreIds.forEach(id => addKey('g', id));

    // Keyword (Gerarchiche tramite HierarchicalGraph)
    const rawKeywordItems = Array.isArray(tmdbData.keywords)
        ? tmdbData.keywords
        : (Array.isArray(tmdbData.keywords?.results) && tmdbData.keywords.results.length > 0
            ? tmdbData.keywords.results
            : (tmdbData.keywords?.keywords || []));
    const keywordIds = (tmdbData.keyword_ids || rawKeywordItems.map(k => k?.id ?? k))
        .filter(id => !isRetiredTmdbKeywordId(id));

    const hVector = HierarchicalGraph.vectorizeKeywords(keywordIds);
    for (const [k, weight] of Object.entries(hVector)) {
        dna[k] = (dna[k] || 0) + (baseWeight * weight);
    }

    // Registi e cast non alimentano più il DNA (scelta di prodotto: le persone lo
    // rendevano troppo restrittivo). Le chiavi `d:`/`a:` eventualmente presenti nei
    // vettori già salvati vengono comunque scartate da normalizeVector.

    // Origin Country
    const countries = tmdbData.origin_country || [];
    countries.forEach(id => addKey('o', id));

    return dna;
}

/**
 * Chiavi DNA relative alle persone (cast `a:` e crew `d:`).
 * Non devono influenzare il DNA: vengono scartate sia in generazione sia in lettura.
 */
function isPersonDnaKey(key) {
    return typeof key === 'string' && (key.startsWith('a:') || key.startsWith('d:'));
}

function stripPersonKeys(vector) {
    if (!vector || typeof vector !== 'object') return vector || {};
    const clean = {};
    for (const [key, value] of Object.entries(vector)) {
        if (isPersonDnaKey(key)) continue;
        clean[key] = value;
    }
    return clean;
}

function normalizeVector(vector) {
    const withoutPersons = stripPersonKeys(vector);
    if (!withoutPersons || typeof withoutPersons !== 'object') return {};
    const sum = Object.values(withoutPersons).reduce((a, b) => a + Number(b || 0), 0);
    if (sum === 0) return {};

    const normalized = {};
    for (let key in withoutPersons) {
        normalized[key] = Number(withoutPersons[key] || 0) / sum;
    }
    return normalized;
}

function calculateWeightedInteractions(historyDocs) {
    if (!historyDocs || !Array.isArray(historyDocs)) return 0;
    let T = 0;
    for (const doc of historyDocs) {
        const signals = doc?.signals;
        if (!signals || !Array.isArray(signals) || signals.length === 0) {
            T += 2; // default: visto (peso 2)
        } else {
            for (const s of signals) {
                if (!s || !s.type) continue;
                if (s.type === 'loved') T += 4;
                else if (s.type === 'liked') T += 3;
                else if (s.type === 'watched') T += 2;
                // library: esclusa (0)
            }
        }
    }
    return T;
}

function computeFinalDNA(V_static, V_active, totalInteractions) {
    // Anti-flat: Rarità dolce applicata a tutte le chiavi del DNA, statiche incluse
    const rareStatic = applySoftRarity(V_static || {});
    const rareActive = applySoftRarity(V_active || {});

    const normStatic = normalizeVector(rareStatic);
    const normActive = normalizeVector(rareActive);

    const hasStatic = Object.keys(normStatic).length > 0;
    const hasActive = Object.keys(normActive).length > 0;

    if (!hasStatic && !hasActive) {
        return {};
    }

    // Se solo uno dei due è presente, assegna il 100% del peso al vettore non vuoto
    let activeWeight = 0;
    let staticWeight = 0;

    if (hasStatic && !hasActive) {
        staticWeight = 1.0;
        activeWeight = 0.0;
    } else if (!hasStatic && hasActive) {
        staticWeight = 0.0;
        activeWeight = 1.0;
    } else {
        // Entrambi presenti: applica la curva w = 0.85 * T / (T + 50) con T pesato
        const tVal = Math.max(0, Number(totalInteractions) || 0);
        activeWeight = tVal > 0 ? (0.85 * tVal) / (tVal + 50) : 0;
        staticWeight = 1 - activeWeight;
    }

    const V_final = {};
    const allKeys = new Set([...Object.keys(normStatic), ...Object.keys(normActive)]);

    for (let key of allKeys) {
        const staticVal = normStatic[key] || 0;
        const activeVal = normActive[key] || 0;
        V_final[key] = ((staticVal * staticWeight) + (activeVal * activeWeight)) * 100;
    }

    // Garanzia di normalizzazione formale a somma costante 100 in scrittura
    const sum = Object.values(V_final).reduce((a, b) => a + (Number(b) || 0), 0);
    if (sum > 0) {
        const factor = 100 / sum;
        for (const k of Object.keys(V_final)) {
            V_final[k] = V_final[k] * factor;
        }
    }

    return V_final;
}

module.exports = {
    // Anti-flat
    computeTimeDecay,
    applyLogSaturation,
    getSoftRarityMultiplier,
    applySoftRarity,
    calculateProfileRelevance,
    calculateFlatnessMetrics,
    setGlobalDfCache,
    getGlobalDfCache,
    DF_MIN_DEFAULT,
    RARITY_MAX_WEIGHT,
    RARITY_ALPHA,
    // Clustering
    cosineSimilarity,
    sparseNorm,
    sparseUnitNormalize,
    resolveK,
    clusterTasteSignals,
    shouldRecomputeClusters,
    MIN_SIGNALS_FOR_CLUSTERING,
    MAX_K,
    MIN_K,
    // Estrazione e fusione
    extractStaticDNAFromQueries,
    extractActiveDNAFromTmdbData,
    computeFinalDNA,
    calculateWeightedInteractions,
    normalizeVector,
    stripPersonKeys,
    isPersonDnaKey
};
