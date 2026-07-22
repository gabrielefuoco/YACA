const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

console.log("=== NEW L4 (Old L3) Macro-Vibes ===");
for (const [id, data] of Object.entries(graph.L4 || {})) {
    console.log(`- [${id}] Medoid: "${data.medoid}" | Children L3: ${data.children_L3.length}`);
}
