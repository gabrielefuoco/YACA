const duckdb = require('duckdb');
const fs = require('fs');

const db = new duckdb.Database(':memory:');
const con = db.connect();

const graphPath = './src/data/hierarchical_graph.json';
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

console.log("1. Calcolo frequenze Generi per ogni Keyword da movies.parquet...");

con.all(`SELECT genres, keywords FROM read_parquet('movies.parquet') WHERE genres IS NOT NULL AND keywords IS NOT NULL`, (err, rows) => {
    if (err) {
        console.error("Errore DuckDB:", err);
        return;
    }
    
    // keyword -> genre -> count
    const kwGenreCounts = {};

    let validMovies = 0;
    for (const row of rows) {
        if (!row.genres || !row.keywords || row.genres === '[]' || row.keywords === '[]') continue;
        
        try {
            const genresList = JSON.parse(row.genres);
            const keywordsList = JSON.parse(row.keywords);
            
            if (genresList.length === 0 || keywordsList.length === 0) continue;
            validMovies++;

            for (const k of keywordsList) {
                const kname = k.name.toLowerCase();
                if (!kwGenreCounts[kname]) kwGenreCounts[kname] = {};
                
                for (const g of genresList) {
                    const gname = g.name; // Mantieni case originale es. "Fantascienza"
                    kwGenreCounts[kname][gname] = (kwGenreCounts[kname][gname] || 0) + 1;
                }
            }
        } catch (e) {
            // Ignora JSON malformati se presenti
        }
    }
    
    console.log(`[OK] Elaborati ${validMovies} film validi.`);
    console.log("2. Aggregazione dei generi per ogni Macro-Vibe (L4)...");

    // Funzione helper per raccogliere tutte le keyword (stringhe) di un nodo
    function getAllKeywordsForL4(m_id, graph) {
        const l4_data = graph.L4[m_id];
        const keywords = new Set();
        
        for (const v_id of l4_data.children_L3) {
            const l3_data = graph.L3[v_id];
            for (const t_id of l3_data.children_L2) {
                const l2_data = graph.L2[t_id];
                for (const c_id of l2_data.children_L1) {
                    const l1_data = graph.L1[c_id];
                    for (const kw of l1_data.keywords) {
                        keywords.add(kw);
                    }
                }
            }
        }
        return Array.from(keywords);
    }

    // Inferenza L4
    for (const [m_id, m_data] of Object.entries(graph.L4)) {
        const l4_keywords = getAllKeywordsForL4(m_id, graph);
        
        const l4GenreCounts = {};
        for (const kw of l4_keywords) {
            const gCounts = kwGenreCounts[kw];
            if (gCounts) {
                for (const [gname, count] of Object.entries(gCounts)) {
                    l4GenreCounts[gname] = (l4GenreCounts[gname] || 0) + count;
                }
            }
        }
        
        // Ordina e prendi i primi 2 generi
        const sortedGenres = Object.entries(l4GenreCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(entry => entry[0]);
            
        m_data.inferred_genres = sortedGenres;
        
        console.log(`  - [${m_id}] ${m_data.medoid} -> Generi Inferiti: [${sortedGenres.join(', ')}]`);
    }

    // Inferenza L3 (facoltativa, ma visto che ci siamo arricchiamo anche i figli!)
    console.log("\n3. Aggregazione dei generi per le Vibe Intermedie (L3)...");
    
    function getAllKeywordsForL3(v_id, graph) {
        const l3_data = graph.L3[v_id];
        const keywords = new Set();
        for (const t_id of l3_data.children_L2) {
            const l2_data = graph.L2[t_id];
            for (const c_id of l2_data.children_L1) {
                const l1_data = graph.L1[c_id];
                for (const kw of l1_data.keywords) {
                    keywords.add(kw);
                }
            }
        }
        return Array.from(keywords);
    }

    for (const [v_id, v_data] of Object.entries(graph.L3)) {
        const l3_keywords = getAllKeywordsForL3(v_id, graph);
        const l3GenreCounts = {};
        for (const kw of l3_keywords) {
            const gCounts = kwGenreCounts[kw];
            if (gCounts) {
                for (const [gname, count] of Object.entries(gCounts)) {
                    l3GenreCounts[gname] = (l3GenreCounts[gname] || 0) + count;
                }
            }
        }
        const sortedGenres = Object.entries(l3GenreCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(entry => entry[0]);
            
        v_data.inferred_genres = sortedGenres;
    }

    console.log("\n4. Salvataggio del nuovo JSON...");
    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2)); // Use indent 2 per non appiattirlo o raw, uso compatto come originale
    // wait, originale era json dump senza indent.
    fs.writeFileSync(graphPath, JSON.stringify(graph));
    console.log("[DONE] Grafo aggiornato con successo!");
});
