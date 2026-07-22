const fs = require('fs');

const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

const targetMedoids = ['animatronic', 'bus', 'worker', 'reconstruction', 'asia', 'double identity'];

console.log("=== Analisi di Qualità dei Cluster L4 ===");

for (const [m_id, m_data] of Object.entries(graph.L4)) {
    if (targetMedoids.includes(m_data.medoid)) {
        console.log(`\nMacro-Vibe [${m_id}] "${m_data.medoid}"`);
        console.log(`  - Generi Inferiti: ${m_data.inferred_genres.join(', ')}`);
        console.log(`  - Top Keywords dirette: ${m_data.top_keywords.slice(0, 15).join(', ')}`);
        
        console.log(`  - Figli L3 (Vibe Intermedie):`);
        m_data.children_L3.forEach(v_id => {
            const v_data = graph.L3[v_id];
            console.log(`      * [${v_id}] "${v_data.medoid}" (Top KWs: ${v_data.top_keywords.slice(0,5).join(', ')})`);
        });
    }
}
