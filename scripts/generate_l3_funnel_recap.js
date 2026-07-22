const fs = require('fs');

const graphPath = './src/data/hierarchical_graph.json';
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const outPath = 'C:\\Users\\gabri\\.gemini\\antigravity\\brain\\a9f178ad-fbce-4d76-a6b0-8c429abfad3e\\l3_funnel_recap.md';

let md = `# Recap dei 143 Sotto-Cluster (L3) e Simulazione Funnel\n\n`;

// 1. LISTA DI TUTTI I CLUSTER L3
md += `## 1. La Lista Completa dei 143 Sotto-Cluster (L3)\n\n`;
md += `Queste sono le "Vibes" effettive che verranno filtrate e presentate all'utente nello Step 2 del Matchmaker.\n\n`;

for (const [v_id, v_data] of Object.entries(graph.L3)) {
    const name = v_data.ui_name || "Senza Nome";
    const emoji = v_data.ui_emoji || "✨";
    const genres = v_data.inferred_genres ? v_data.inferred_genres.join(', ') : "N/A";
    const kws = v_data.top_keywords ? v_data.top_keywords.slice(0, 5).join(', ') : "";
    md += `- **${emoji} ${name}** (Generi: *${genres}*) -> [Keyword principali: *${kws}*]\n`;
}

// 2. SIMULAZIONE DI 10 FUNNEL
md += `\n\n## 2. Dieci Esempi di Funnel Dinamico\n\n`;
md += `Come reagisce il sistema in base ai generi scelti nello Step 1:\n\n`;

function getTopVibesForGenres(genres, topK = 10) {
    const results = [];
    for (const [v_id, v_data] of Object.entries(graph.L3)) {
        let totalKeywords = 0;
        if (v_data.children_L2) {
            for (const l2 of v_data.children_L2) {
                const l2_node = graph.L2[l2];
                if (l2_node && l2_node.children_L1) {
                    for (const l1 of l2_node.children_L1) {
                        const l1_node = graph.L1[l1];
                        if (l1_node && l1_node.keywords) {
                            totalKeywords += l1_node.keywords.length;
                        }
                    }
                }
            }
        }
        
        let score = 0;
        let matchCount = 0;
        const dist = v_data.genre_distribution || {};
        for (const g of genres) {
            if (dist[g] && dist[g] > 0.01) {
                score += dist[g];
                matchCount++;
            }
        }
        
        score = score * (matchCount / genres.length);
        const massBonus = Math.min(1.0, Math.log10(Math.max(2, totalKeywords)) / 2.0);
        score = score * massBonus;
        
        if (score > 0) {
            results.push({
                name: v_data.ui_name,
                emoji: v_data.ui_emoji,
                score: score.toFixed(3)
            });
        }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
}

const testCases = [
    ["Azione", "Crime", "Thriller"],
    ["Fantascienza", "Azione", "Avventura"],
    ["Romance", "Commedia"],
    ["Horror", "Mistero"],
    ["Animazione", "Famiglia"],
    ["Documentario", "Musica"],
    ["Dramma", "Storia", "Guerra"],
    ["Fantasy", "Avventura", "Famiglia"],
    ["Western", "Azione"],
    ["Thriller", "Fantascienza", "Horror"],
    ["Commedia", "Crime"],
    ["Azione", "Commedia"],
    ["Dramma", "Romance"],
    ["Horror", "Commedia"],
    ["Animazione", "Fantascienza"],
    ["Avventura", "Dramma"],
    ["Crime", "Mistero", "Dramma"],
    ["Documentario", "Storia"],
    ["Fantasy", "Horror"],
    ["Musica", "Dramma", "Romance"]
];

for (const genres of testCases) {
    md += `### Selezionati: \`[${genres.join(' + ')}]\`\n`;
    const vibes = getTopVibesForGenres(genres, 10);
    for (let i = 0; i < vibes.length; i++) {
        const v = vibes[i];
        md += `${i+1}. ${v.emoji} **${v.name}** *(Score: ${v.score})*\n`;
    }
    md += `\n`;
}

fs.writeFileSync(outPath, md);
console.log("Artifact generated successfully.");
