const fs = require('fs');

// 1. Caricamento Dati
console.log("Caricamento graph_data.json...");
const graphData = JSON.parse(fs.readFileSync('../src/data/graph_data.json', 'utf8'));
const clusterIds = Object.keys(graphData.cluster_members).sort((a, b) => parseInt(a) - parseInt(b));

// Mappa da cluster ID a Indice del Vettore (0...1531)
const clusterToIndex = new Map();
clusterIds.forEach((id, index) => clusterToIndex.set(id, index));
const VECTOR_SIZE = clusterIds.length;

// 2. Calcolo Gradi (Hub Penalty)
console.log("Calcolo dei Gradi (Hub Penalty)...");
const clusterDegrees = {};
for (const cId of clusterIds) {
    const adj = graphData.cluster_adjacency[cId] || {};
    clusterDegrees[cId] = Object.keys(adj).length;
}

function getHubPenalty(clusterId) {
    const degree = clusterDegrees[clusterId] || 1;
    // Log in base 10 (degree + 10) garantisce che un nodo di nicchia (degree 1) abbia penalty ~1.04
    // e un nodo iper-connesso (degree 500) abbia penalty ~2.7
    return Math.log10(degree + 10);
}

// 3. Motore Vector Space
function buildSignature(keywords) {
    const vector = new Float32Array(VECTOR_SIZE);
    const seeds = new Set();

    // Fase 1: Seed Nodes
    for (const kw of keywords) {
        const cId = graphData.keyword_to_cluster[kw.toLowerCase()];
        if (cId) {
            seeds.add(cId);
            const index = clusterToIndex.get(cId);
            vector[index] += 1.0; // Energia iniziale
        } else {
            console.log(`[Warning] Keyword non trovata nel grafo: '${kw}'`);
        }
    }

    // Fase 2: Spreading Activation (Hop 1)
    for (const seedId of seeds) {
        const adj = graphData.cluster_adjacency[seedId] || {};
        for (const [neighborId, weight] of Object.entries(adj)) {
            if (seeds.has(neighborId)) continue; // Evita di sovrascrivere l'energia pura dei seed
            
            const nIndex = clusterToIndex.get(neighborId);
            const penalty = getHubPenalty(neighborId);
            
            // Energia propagata = Forza dell'arco diviso la penalty del nodo di destinazione
            vector[nIndex] += (weight / penalty);
        }
    }

    // Fase 3: Normalizzazione L2
    let sumSquares = 0;
    for (let i = 0; i < VECTOR_SIZE; i++) {
        sumSquares += vector[i] * vector[i];
    }
    const magnitude = Math.sqrt(sumSquares);
    if (magnitude > 0) {
        for (let i = 0; i < VECTOR_SIZE; i++) {
            vector[i] /= magnitude;
        }
    }

    return vector;
}

function cosineSimilarity(v1, v2) {
    let dotProduct = 0;
    for (let i = 0; i < VECTOR_SIZE; i++) {
        dotProduct += v1[i] * v2[i];
    }
    return dotProduct;
}

// 4. Test con i 3 Film
console.log("\n--- INIZIO TEST SIMILARITÀ FILM ---");

const movies = {
    "Il Signore degli Anelli": [
        "elves", "orcs", "magic", "wizard", "dwarf", "sword and sorcery", "quest", "epic"
    ],
    "Lo Hobbit": [
        "dragon", "wizard", "dwarf", "orcs", "mountain", "sword and sorcery", "quest", "epic"
    ],
    "Forrest Gump": [
        "vietnam veteran", "washington dc", "running", "friendship", "1960s", "mental disability", "love of one's life", "tennis"
    ]
};

const signatures = {};
for (const [title, kws] of Object.entries(movies)) {
    signatures[title] = buildSignature(kws);
}

console.log("\nRisultati Cosine Similarity:");

const lotr_hobbit = cosineSimilarity(signatures["Il Signore degli Anelli"], signatures["Lo Hobbit"]);
console.log(`LOTR vs Hobbit        : ${(lotr_hobbit * 100).toFixed(2)}%`);

const lotr_gump = cosineSimilarity(signatures["Il Signore degli Anelli"], signatures["Forrest Gump"]);
console.log(`LOTR vs Forrest Gump  : ${(lotr_gump * 100).toFixed(2)}%`);

const hobbit_gump = cosineSimilarity(signatures["Lo Hobbit"], signatures["Forrest Gump"]);
console.log(`Hobbit vs Forrest Gump: ${(hobbit_gump * 100).toFixed(2)}%`);
