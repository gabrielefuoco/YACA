const fs = require('fs');
const hierarchicalGraph = require('../src/engines/graph/HierarchicalGraph');

function simulateInfluenceSpread(startKeyword) {
    console.log(`\n======================================================`);
    console.log(`🚀 SIMULAZIONE PROPAGAZIONE INFLUENZA: "${startKeyword.toUpperCase()}"`);
    console.log(`======================================================\n`);

    hierarchicalGraph.loadData();
    const data = hierarchicalGraph.data;

    // 1. L0: Raw Keyword
    const l1Id = data.kw_to_L1[startKeyword];
    if (!l1Id) {
        console.log(`❌ Keyword "${startKeyword}" non trovata nel grafo.`);
        return;
    }

    const l1Node = data.L1[l1Id];
    console.log(`[L0 -> L1] Ascesa al Micro-Cluster`);
    console.log(`La keyword "${startKeyword}" attiva il Micro-Cluster [ ${l1Id} ].`);
    console.log(`   └> Compagni di Micro-Cluster: ${l1Node.keywords.slice(0, 5).join(', ')}${l1Node.keywords.length > 5 ? '...' : ''}\n`);

    // 2. Diffusione Orizzontale (Ponti Semantici L1)
    console.log(`[L1 -> L1] Propagazione Orizzontale (Adiacenze Gravitazionali)`);
    const adjacency = data.L1_adjacency[l1Id];
    if (adjacency) {
        const topNeighbors = Object.entries(adjacency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5); // top 5
        
        console.log(`Il Micro-Cluster [ ${l1Id} ] attrae gravitazionalmente altri cluster:`);
        for (const [neighborId, weight] of topNeighbors) {
            const neighborNode = data.L1[neighborId];
            const sampleKw = neighborNode ? neighborNode.keywords.slice(0, 3).join(', ') : '???';
            console.log(`   => [ ${neighborId} ] (Forza: ${weight}) => ${sampleKw}`);
        }
    } else {
        console.log(`   Nessun ponte semantico forte trovato.\n`);
    }
    console.log();

    // 3. L1 -> L2: Topos Narrativo
    const l2Id = l1Node.parent;
    if (l2Id) {
        const l2Node = data.L2[l2Id];
        console.log(`[L1 -> L2] Ascesa al Topos Narrativo`);
        console.log(`L'influenza sale al Topos [ ${l2Id} ].`);
        console.log(`Questo Topos raccoglie e unisce i seguenti Micro-Cluster L1:`);
        
        // Trova i "fratelli" L1 di questo Topos
        const allL1Siblings = Object.entries(data.L1).filter(([id, node]) => node.parent === l2Id);
        const l1Siblings = allL1Siblings.slice(0, 5); // mostra i primi 5

        for (const [sibId, sibNode] of l1Siblings) {
            const highlight = sibId === l1Id ? '📍 (Tu sei qui)' : '';
            console.log(`   - [ ${sibId} ]: ${sibNode.keywords.slice(0, 3).join(', ')} ${highlight}`);
        }
        if (allL1Siblings.length > 5) console.log(`   ... e altri ${allL1Siblings.length - 5} micro-cluster.\n`);
        else console.log();

        // 4. L2 -> L3: Macro-Vibe
        const l3Id = l2Node.parent;
        if (l3Id) {
            const l3Node = data.L3[l3Id];
            console.log(`[L2 -> L3] Ascesa al Macro-Vibe`);
            console.log(`L'influenza raggiunge la cima della piramide: il Macro-Vibe [ ${l3Id} ].`);
            console.log(`Questo enorme contenitore include i seguenti Topoi L2:`);
            
            const allL2Siblings = Object.entries(data.L2).filter(([id, node]) => node.parent === l3Id);
            const l2Siblings = allL2Siblings.slice(0, 5);

            for (const [sibId, sibNode] of l2Siblings) {
                const highlight = sibId === l2Id ? '📍 (Il tuo Topos)' : '';
                // Trova un L1 figlio di questo topos
                const sampleL1Id = Object.keys(data.L1).find(id => data.L1[id].parent === sibId);
                const sampleKw = sampleL1Id ? (data.L1[sampleL1Id].keywords[0] || '???') : '???';
                console.log(`   - [ ${sibId} ] (es. ${sampleKw}) ${highlight}`);
            }
            if (allL2Siblings.length > 5) console.log(`   ... e altri ${allL2Siblings.length - 5} Topoi.\n`);
            else console.log();
        }
    }
}

// Testiamo un paio di keyword diverse
simulateInfluenceSpread("spacecraft");
simulateInfluenceSpread("vampire");
simulateInfluenceSpread("martial arts");
