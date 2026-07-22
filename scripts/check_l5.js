const fs = require('fs');
const g = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

console.log("=== ROOT NODES L5 ===");
for (const [r_id, r_data] of Object.entries(g.L5)) {
    console.log(`\nL5 Root [${r_id}] - Medoid: "${r_data.medoid}"`);
    console.log(`  - Top Keywords: ${r_data.top_keywords.slice(0, 5).join(', ')}`);
    console.log(`  - Macro-Vibes L4 incluse:`);
    r_data.children_L4.forEach(m_id => {
        const l4 = g.L4[m_id];
        console.log(`      * [${m_id}] ${l4.ui_emoji} ${l4.ui_name} (Medoid: ${l4.medoid})`);
    });
}
