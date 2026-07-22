const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

console.log("=== NEW L5 (Roots) and L4 (Macro-Vibes) ===");
for (const [r_id, r_data] of Object.entries(graph.L5 || {})) {
    if (r_data.children_L4.length > 5) {
        console.log(`\nROOT [${r_id}] ${r_data.medoid}:`);
        r_data.children_L4.slice(0, 15).forEach(m_id => {
            const m_data = graph.L4[m_id];
            console.log(`  - [${m_id}] Medoid: "${m_data.medoid}" | L3 Children: ${m_data.children_L3.length}`);
        });
    }
}
