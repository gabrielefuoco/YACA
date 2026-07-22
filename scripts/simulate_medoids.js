const fs = require('fs');
const graphPath = './src/data/hierarchical_graph.json';
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

// Simula il calcolo del Medoide prendendo la prima keyword (il centroide presunto dal clustering)
function getMedoid(nodeData) {
    if (nodeData && nodeData.top_keywords && nodeData.top_keywords.length > 0) {
        return nodeData.top_keywords[0];
    }
    return 'Unknown';
}

console.log("=== SIMULAZIONE INTERAZIONE (Dal Generale al Particolare) ===\n");
console.log("Sei l'utente. Il sistema ti mostra le categorie di livello L5 (Root):");

const rootKeys = Object.keys(graph.L5);
rootKeys.forEach(id => {
    const medoid = getMedoid(graph.L5[id]);
    console.log(`- [${id}] "${medoid}"`);
});

console.log("\n-> L'utente sceglie 'r_0' (che sembra contenere il grosso del cinema).");
console.log("\nIl sistema scende in L4 e ti mostra i sotto-rami di 'r_0':");
const m0_children = graph.L5['r_0'].children_L4 || [];
m0_children.forEach(id => {
    const medoid = getMedoid(graph.L4[id]);
    console.log(`  - [${id}] "${medoid}"`);
});

console.log("\n-> C'è solo 'm_0'. Scendiamo in L3 (Le macro-vibes di m_0):");
const m0_l3_children = graph.L4['m_0'].children_L3 || [];
m0_l3_children.forEach(id => {
    const medoid = getMedoid(graph.L3[id]);
    console.log(`    - [${id}] "${medoid}"`);
});

console.log("\n-> Finalmente vediamo varietà! L'utente sceglie 'v_3' (spacecraft). Scendiamo in L2 (I Topoi specifici di v_3):");
const v3_l2_children = graph.L3['v_3'].children_L2 || [];
v3_l2_children.forEach(id => {
    const medoid = getMedoid(graph.L2[id]);
    console.log(`      - [${id}] "${medoid}"`);
});

console.log("\n-> L'utente sceglie 't_4' (spacecraft). Mostriamo i micro-cluster L1 finali:");
const t4_l1_children = graph.L2['t_4'].children_L1 || [];
t4_l1_children.forEach(id => {
    // L1 nodes in graph_data or hierarchical_graph might not have top_keywords directly
    // Wait, let's just print the ID for L1
    console.log(`        - [${id}] (Micro-cluster)`);
});
