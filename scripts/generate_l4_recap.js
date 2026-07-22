const fs = require('fs');

const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

let markdown = `# L4 Macro-Vibes Recap\n\nQuesto documento elenca tutti i 70 Macro-Vibes (Livello L4) rigenerati, con i loro nomi UI, generi inferiti e le prime 5 keyword.\n\n`;

for (const [m_id, m_data] of Object.entries(graph.L4)) {
    const genres = m_data.inferred_genres.length > 0 ? m_data.inferred_genres.join(', ') : 'Nessuno';
    const topKeywords = m_data.top_keywords.slice(0, 5).join(', ');
    
    markdown += `### ${m_data.ui_emoji} ${m_data.ui_name}\n`;
    markdown += `- **ID Originale:** \`${m_id}\`\n`;
    markdown += `- **Medoide Matematico:** \`${m_data.medoid}\`\n`;
    markdown += `- **Generi Inferiti (TMDB):** ${genres}\n`;
    markdown += `- **Top 5 Keyword:** ${topKeywords}\n`;
    markdown += `- **Cluster L3 (Figli):** ${m_data.children_L3.length}\n\n`;
}

const outputPath = 'C:\\Users\\gabri\\.gemini\\antigravity\\brain\\a9f178ad-fbce-4d76-a6b0-8c429abfad3e\\l4_macro_vibes_recap.md';
fs.writeFileSync(outputPath, markdown);
console.log(`Artifact generated at ${outputPath}`);
