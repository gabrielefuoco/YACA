require('dotenv').config();
const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
const { getDuckDbMetaDetails } = require('../src/catalog/providers/DuckDbProvider');
const duckDbStore = require('../src/db/duckDbStore');

async function run() {
    try {
        console.log("=== INIZIO TEST INTEGRAZIONE DUCKDB ===");
        await duckDbStore.init();

        console.log("\n1. Test Catalog (Discover - Animazione e Famiglia - Più Popolari)");
        const filters = {
            with_genres: '16,10751',
            sort_by: 'popularity.desc'
        };

        const activeProfileSettings = {};
        const catalog = await getDuckDbCatalogFromFilters(filters, 'movie', 0, 5, activeProfileSettings);

        if (catalog.length === 0) {
            console.warn("⚠️ Nessun risultato trovato nel catalogo. Il file Parquet è popolato?");
        } else {
            console.log(`✅ Trovati ${catalog.length} risultati.`);
            catalog.forEach((item, idx) => {
                console.log(`   [${idx + 1}] ${item.name} (${item.id}) - Popolarità: ${item.popularity} - Rating: ${item.imdbRating}`);
            });

            const firstItemId = catalog[0]._tmdbId || catalog[0].id.replace('tmdb:', '');
            
            console.log(`\n2. Test Meta Details (TMDB ID: ${firstItemId})`);
            const meta = await getDuckDbMetaDetails(firstItemId, 'movie');

            if (!meta) {
                console.warn(`⚠️ Nessun dettaglio trovato per ID ${firstItemId}.`);
            } else {
                console.log(`✅ Dettagli estratti correttamente:`);
                console.log(`   - Nome: ${meta.name}`);
                console.log(`   - Poster: ${meta.poster}`);
                console.log(`   - Descrizione: ${meta.description.substring(0, 100)}...`);
                console.log(`   - Anno: ${meta.releaseInfo}`);
                console.log(`   - Generi: ${meta.genre_ids.join(', ')}`);
                console.log(`   - Runtime/Video Hints:`, meta.behaviorHints);
                console.log(`   - Raw TMDB Cast (primi 2):`, meta.rawTMDB.credits?.cast?.slice(0, 2).map(c => c.name));
            }
        }

    } catch (err) {
        console.error("❌ ERRORE TEST:", err);
    } finally {
        duckDbStore.close();
        console.log("\n=== FINE TEST ===");
    }
}

run();
