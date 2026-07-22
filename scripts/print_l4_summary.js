const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

console.log("=== Macro-Vibes L4 (UI Name, Genres, Top 3 KWs) ===");
for (const [m_id, m_data] of Object.entries(graph.L4)) {
    if (m_data.children_L3.length > 1) { // Skip single-node outliers for clarity, or show them? The user wants to understand the clusters. Let's show all that have > 0 inferred genres.
        if (m_data.inferred_genres.length > 0) {
            console.log(`\n${m_data.ui_emoji} ${m_data.ui_name} (Medoid orig: "${m_data.medoid}")`);
            console.log(`   - Generi: [${m_data.inferred_genres.join(', ')}]`);
            console.log(`   - Top 3 Keyword: ${m_data.top_keywords.slice(0, 3).join(', ')}`);
        }
    }
}
