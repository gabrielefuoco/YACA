const hierarchicalGraph = require('../src/engines/graph/HierarchicalGraph');

function simulateMovieInfluence(movieTitle, keywordsArray) {
    console.log(`\n======================================================`);
    console.log(`🎬 ANALISI INFLUENZE DEL FILM: "${movieTitle.toUpperCase()}"`);
    console.log(`======================================================\n`);

    hierarchicalGraph.loadData();
    const data = hierarchicalGraph.data;

    console.log(`1. KEYWORD DEL FILM (L0)`);
    console.log(`Hai appena guardato il film e hai "assimilato" queste keyword TMDB:`);
    console.log(`   [ ${keywordsArray.join(', ')} ]\n`);

    // Calcoliamo i Micro-Cluster L1 attivati
    const activatedL1 = {};
    for (const kw of keywordsArray) {
        const l1Id = data.kw_to_L1[kw];
        if (l1Id) {
            activatedL1[l1Id] = (activatedL1[l1Id] || 0) + 1;
        }
    }

    console.log(`2. MICRO-CLUSTER ATTIVATI (L1)`);
    console.log(`Il motore raggruppa le keyword accendendo i seguenti nodi cerebrali L1:`);
    for (const [l1Id, weight] of Object.entries(activatedL1)) {
        const node = data.L1[l1Id];
        console.log(`   => [ ${l1Id} ] x${weight} (Contiene: ${node.keywords.slice(0, 3).join(', ')}...)`);
    }
    console.log();

    console.log(`3. PROPAGAZIONE ORIZZONTALE (Ponti Semantici L1)`);
    console.log(`L'insieme di questi cluster attrae per "gravità" altri cluster correlati (che il film NON ha):`);
    
    const combinedAdjacency = {};
    for (const l1Id of Object.keys(activatedL1)) {
        const adj = data.L1_adjacency[l1Id] || {};
        for (const [neighborId, w] of Object.entries(adj)) {
            if (!activatedL1[neighborId]) { // Escludi quelli che abbiamo già
                combinedAdjacency[neighborId] = (combinedAdjacency[neighborId] || 0) + w;
            }
        }
    }
    
    const topNeighbors = Object.entries(combinedAdjacency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

    for (const [neighborId, weight] of topNeighbors) {
        const node = data.L1[neighborId];
        console.log(`   -- Attirato con forza ${weight.toFixed(1)} -> [ ${neighborId} ] (${node.keywords.slice(0, 3).join(', ')}...)`);
    }
    console.log();

    console.log(`4. ASCESA AL TOPOS NARRATIVO (L2)`);
    console.log(`I Micro-Cluster spingono l'influenza verso l'alto, identificando il "Genere Profondo" (Topos):`);
    
    const activatedL2 = {};
    for (const l1Id of Object.keys(activatedL1)) {
        const l2Id = data.L1[l1Id].parent;
        if (l2Id) {
            activatedL2[l2Id] = (activatedL2[l2Id] || 0) + 1;
        }
    }

    for (const [l2Id, weight] of Object.entries(activatedL2)) {
        const node = data.L2[l2Id];
        console.log(`   => TOPOS [ ${l2Id} ] attivato con potenza x${weight}!`);
        
        // Troviamo altri L1 in questo Topos
        const siblingsL1 = Object.entries(data.L1)
            .filter(([id, n]) => n.parent === l2Id && !activatedL1[id])
            .slice(0, 3);
            
        console.log(`      Questo significa che l'algoritmo ora saprà che ti piacciono ANCHE questi cluster fratelli:`);
        for (const [sibId, sibNode] of siblingsL1) {
            console.log(`      - [ ${sibId} ] (${sibNode.keywords.slice(0, 3).join(', ')})`);
        }
    }
    console.log(`\n======================================================`);
    console.log(`CONCLUSIONE: Ora se un film ha i "cavalieri" o gli "elfi" (cluster fratelli nel Topos), `);
    console.log(`verrà raccomandato con forza anche se ne "Il Signore degli Anelli" non c'era quella precisa keyword TMDB!`);
}

// Simuliamo Il Signore degli Anelli
simulateMovieInfluence("Il Signore degli Anelli", [
    "elves", "dwarf", "orc", "magic", "wizard", "quest", "ring", "hobbit", "middle earth", "journey", "epic"
]);

// Simuliamo Avatar
simulateMovieInfluence("Avatar", [
    "alien planet", "marine", "ecology", "3d", "nature", "bioluminescence", "indigenous", "space travel"
]);

// Simuliamo Game of Thrones
simulateMovieInfluence("Game of Thrones", [
    "dragon", "king", "kingdom", "political intrigue", "betrayal", "sword", "zombie", "winter", "politics", "incest"
]);
