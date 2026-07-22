const fs = require('fs');

const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

function getTopVibesForGenres(genres, topK = 5) {
    const results = [];
    
    for (const [m_id, m_data] of Object.entries(graph.L3)) {
        if (m_data.nsfw) continue; // Skip clusters flaggati come NSFW/Problematici
        
        // Calcoliamo la "massa" (numero totale di keyword nel cluster)
        let totalKeywords = 0;
        if (m_data.children_L2) {
            for (const l2 of m_data.children_L2) {
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
        const dist = m_data.genre_distribution || {};
        
        // Calcoliamo lo score premiando l'intersezione (quanti generi copre il cluster)
        let matchCount = 0;
        for (const g of genres) {
            if (dist[g] && dist[g] > 0.01) { // consideriamo match se copre almeno 1%
                score += dist[g];
                matchCount++;
            }
        }
        
        // Moltiplicatore di diversità
        score = score * (matchCount / genres.length);
        
        // Moltiplicatore di massa: penalizziamo logaritmicamente i micro-cluster
        // Se un cluster ha solo 1-3 keyword, il suo moltiplicatore sarà bassissimo (es. 0.15).
        // Se ha 100 keyword, si satura dolcemente a 1.0.
        const massBonus = Math.min(1.0, Math.log10(Math.max(2, totalKeywords)) / 2.0); // max a 100 keywords
        score = score * massBonus;
        
        if (score > 0) {
            results.push({
                id: m_id,
                name: m_data.ui_name || m_data.medoid,
                emoji: m_data.ui_emoji || "✨",
                score: score.toFixed(3),
                top_genres: m_data.inferred_genres.join(', ')
            });
        }
    }
    
    // Ordiniamo per score decrescente
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

console.log("=== TEST DEL GENRE-TO-VIBE FUNNEL ===\n");

for (const genres of testCases) {
    console.log(`Combos Scelta: [${genres.join(' + ')}]`);
    const vibes = getTopVibesForGenres(genres, 10);
    for (let i = 0; i < vibes.length; i++) {
        const v = vibes[i];
        console.log(`  ${i+1}. ${v.emoji} ${v.name} (Score: ${v.score}) [Generi base: ${v.top_genres}]`);
    }
    console.log("---------------------------------------------------");
}
