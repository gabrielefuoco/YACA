const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

console.log("=== NEW L3 (Intermediate) ===");
for (const [m_id, m_data] of Object.entries(graph.L4 || {})) {
    if (m_data.children_L3.length > 5) {
        console.log(`\nMacro-Vibe [${m_id}] ${m_data.medoid}:`);
        m_data.children_L3.slice(0, 10).forEach(v_id => {
            const v_data = graph.L3[v_id];
            console.log(`  - [${v_id}] Medoid: "${v_data.medoid}" | L2 Children: ${v_data.children_L2.length}`);
        });
    }
}
