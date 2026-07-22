const duckdb = require('duckdb');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../movies.parquet');
const CACHE_KWS = path.join(__dirname, '../offline_graph_builder/cache/kw_genres.json');

console.log('[1/3] Connessione a DuckDB e avvio estrazione...');

const db = new duckdb.Database(':memory:');

// Dobbiamo estrarre tutte le keywords e tutti i generi
// E calcolare per ogni keyword la distribuzione dei generi.
const query = `
  SELECT genres, keywords
  FROM read_parquet('${DB_PATH.replace(/\\/g, '/')}')
  WHERE genres IS NOT NULL AND keywords IS NOT NULL
`;

db.all(query, (err, rows) => {
    if (err) {
        console.error("Errore DuckDB:", err);
        return;
    }

    console.log(`[2/3] Elaborazione di ${rows.length} film...`);
    const kw_genres = {}; // { 'keyword': { 'Azione': 10, 'Horror': 2, ... } }

    rows.forEach(row => {
        try {
            const genresArr = JSON.parse(row.genres);
            const kwsArr = JSON.parse(row.keywords);
            
            const genreNames = genresArr.map(g => g.name);
            const kwNames = kwsArr.map(k => k.name.toLowerCase().trim());

            kwNames.forEach(kw => {
                if (!kw_genres[kw]) {
                    kw_genres[kw] = {};
                }
                genreNames.forEach(g => {
                    kw_genres[kw][g] = (kw_genres[kw][g] || 0) + 1;
                });
            });
        } catch (e) {
            // skip malformed json
        }
    });

    // Normalizziamo in probabilità
    console.log('[3/3] Normalizzazione delle distribuzioni...');
    const kw_genre_probs = {};
    let valid_kws = 0;

    for (const [kw, g_counts] of Object.entries(kw_genres)) {
        let total = 0;
        for (const count of Object.values(g_counts)) {
            total += count;
        }
        
        if (total > 0) {
            kw_genre_probs[kw] = {};
            for (const [g, count] of Object.entries(g_counts)) {
                kw_genre_probs[kw][g] = count / total;
            }
            valid_kws++;
        }
    }

    fs.writeFileSync(CACHE_KWS, JSON.stringify(kw_genre_probs, null, 2));
    console.log(`[DONE] Salvate distribuzioni per ${valid_kws} keyword in ${CACHE_KWS}`);
});
