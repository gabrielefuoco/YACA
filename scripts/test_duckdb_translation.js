const { getPresets } = require('../src/data/presets.js');
const { buildSqlFromTmdbQuery } = require('../src/utils/tmdbToSqlTranslator.js');
const duckDbStore = require('../src/db/duckDbStore.js');

async function testTranslation() {
    console.log('[Test] Avvio test del traduttore SQL su tutti i preset...');
    await duckDbStore.init();
    
    // Creiamo una view TV fittizia per far passare la validazione sintattica di DuckDB
    await duckDbStore.query(`CREATE VIEW IF NOT EXISTS tv AS SELECT * FROM movies LIMIT 0;`);

    const presets = getPresets();
    let errors = 0;
    
    for (const preset of presets) {
        if (!preset.queries || preset.queries.length === 0) continue;
        
        const tmdbQuery = preset.queries[0];
        // Kitsu non usa il db TMDB
        if (tmdbQuery.provider === 'kitsu') continue;
        
        try {
            const sql = buildSqlFromTmdbQuery(tmdbQuery, preset.type, 0, 10);
            // Proviamo a fare l'explain per testare la sintassi in DuckDB
            await duckDbStore.query(`EXPLAIN ${sql}`);
            console.log(`✅ [${preset.id}] Traduzione corretta.`);
        } catch (err) {
            console.error(`❌ [${preset.id}] ERRORE SQL:`, err.message);
            console.error(`   TMDB Query:`, tmdbQuery);
            errors++;
        }
    }
    
    duckDbStore.close();
    
    if (errors === 0) {
        console.log('\n✅ Tutti i preset di TMDB sono stati tradotti in SQL valido!');
        process.exit(0);
    } else {
        console.log(`\n❌ Trovati ${errors} errori nei preset.`);
        process.exit(1);
    }
}

testTranslation();
