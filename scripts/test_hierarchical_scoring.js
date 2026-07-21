const ProfileScorer = require('../src/profile/ProfileScorer');
const hierarchicalGraph = require('../src/engines/graph/HierarchicalGraph');

// 1. Definiamo un Mock Profile di un fan sfegatato di "Sci-Fi Spaziale"
// Mettiamo un'alta affinità per il L1 Micro-Cluster di Spacecraft (c_2) 
// E un'affinità media per il suo L2 Topos (t_5) e L3 Macro-Vibe (v_0)
const mockProfile = {
    settings: { kidsMode: false },
    compiledVectors: {
        V_final: {
            'L1:c_2': 5.0,     // Super affinità per Spacecraft (Micro-Cluster)
            'L2:t_10': 2.0,    // Affinità moderata per il Topos Sci-Fi (che contiene anche Alien)
            'L3:v_1': 0.5      // Piccola affinità per il Macro-Vibe
        }
    }
};

// 2. Creiamo film finti con diverse combinazioni di keyword grezze L0
// Nel json "c_2" contiene 'spacecraft', "c_11" contiene 'sexual massage' etc.
const movies = [
    {
        title: "Interstellar 2 (Direct Match L1)",
        keywords: [{id: "spacecraft"}, {id: "black hole"}] 
    },
    {
        title: "The Terminator (Cross-Topos Horizontal Match)",
        // 'killer robot' appartiene a un L2 completamente diverso (t_9: Computer/Robots)
        // Ma nel Grafo Orizzontale, i Robot sono fortemente legati allo Spazio!
        keywords: [{id: "killer robot"}, {id: "robotics"}]
    },
    {
        title: "The Notebook (Total Miss)",
        keywords: [{id: "romance"}, {id: "love"}]
    }
];

console.log("=== YACA HIERARCHICAL VSM TEST ===");
console.log("User DNA Profile:");
console.dir(mockProfile.compiledVectors.V_final);
console.log("\nScoring Movies...");

// Initialize graph
hierarchicalGraph.loadData();

for (const movie of movies) {
    // Il ProfileScorer necessita dell'oggetto in formato TMDB
    const tmdbFormat = {
        title: movie.title,
        keywords: { results: movie.keywords },
        vote_average: 7.5,
        vote_count: 500,
        popularity: 50
    };

    // Calculate score
    const score = ProfileScorer.calculateBaseItemMatch(tmdbFormat, mockProfile);
    
    // Vediamo cosa estrae il Vectorizer dal film
    const movieVector = hierarchicalGraph.vectorizeKeywords(movie.keywords.map(k => k.id));

    // Dobbiamo calcolarlo a mano per far vedere il debug all'utente
    let thematicScore = 0;
    for (const [nodeKey, movieNodeWeight] of Object.entries(movieVector)) {
        const userAffinity = mockProfile.compiledVectors.V_final[nodeKey];
        if (userAffinity) {
            thematicScore += (userAffinity * movieNodeWeight);
        }
    }

    console.log(`\n🎬 ${movie.title}`);
    console.log(`   Generato Vector:`, movieVector);
    console.log(`   Thematic Score:  ${thematicScore.toFixed(2)}`);
    console.log(`   Final Score:     ${score.toFixed(4)}`);
}
