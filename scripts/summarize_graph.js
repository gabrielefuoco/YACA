const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

console.log("=== ROOT NODES (L5) ===");
for (const [id, data] of Object.entries(graph.L5 || {})) {
    console.log(`[${id}] ${data.name}`);
}

console.log("\n=== MACRO CATEGORIES (L4) ===");
const l4ByL5 = {};
for (const [id, data] of Object.entries(graph.L4 || {})) {
    if (!l4ByL5[data.parent]) l4ByL5[data.parent] = [];
    l4ByL5[data.parent].push(`[${id}] ${data.name}`);
}

for (const [parent, children] of Object.entries(l4ByL5)) {
    console.log(`\nUnder ${graph.L5?.[parent]?.name || parent}:`);
    children.forEach(c => console.log(`  - ${c}`));
}

console.log("\n=== Example L3 for L4 'm_1' (Narrative & Action) ===");
for (const [id, data] of Object.entries(graph.L3 || {})) {
    if (data.parent === 'm_1') {
        console.log(`[${id}] ${data.name}`);
    }
}
