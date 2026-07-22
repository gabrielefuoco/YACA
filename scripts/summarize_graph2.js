const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

console.log("=== ROOT NODES (L5) ===");
for (const [id, data] of Object.entries(graph.L5 || {})) {
    console.log(`[${id}] Keys: ${Object.keys(data).join(', ')}`);
    console.log(data);
    break;
}

console.log("\n=== MACRO CATEGORIES (L4) ===");
for (const [id, data] of Object.entries(graph.L4 || {})) {
    console.log(`[${id}] Keys: ${Object.keys(data).join(', ')}`);
    console.log(data);
    break;
}

console.log("\n=== L3 ===");
for (const [id, data] of Object.entries(graph.L3 || {})) {
    console.log(`[${id}] Keys: ${Object.keys(data).join(', ')}`);
    console.log(data);
    break;
}
