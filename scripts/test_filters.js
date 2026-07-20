require('dotenv').config();
const duckDbStore = require('../src/db/duckDbStore');
const tmdbToSqlTranslator = require('../src/utils/tmdbToSqlTranslator');
const { getPresets } = require('../src/data/presets');

async function testFilters() {
    console.log("=== INIZIO TEST FILTRI YACA ===");
    await duckDbStore.init();

    // 1. Simula l'inserimento di alcuni Anime da Anibridge
    console.log("\n[1] Simulo sincronizzazione Anime Mappings...");
    const mockAnimeIds = [37854, 21, 1104]; // One Piece, ecc.
    await duckDbStore.updateAnimeMapping(mockAnimeIds);

    // 2. Test traduzione SQL per Anime Popolari
    console.log("\n[2] Traduzione Query: Anime Popolari");
    const presets = getPresets();
    const animePreset = presets.find(p => p.id === 'preset_pop_anime');
    if (animePreset) {
        const sql = tmdbToSqlTranslator.buildSqlFromTmdbQuery(animePreset.queries[0], 'tv');
        console.log("SQL Generato:\n" + sql);
    }

    // 3. Test traduzione SQL per Blockbuster da Saga
    console.log("\n[3] Traduzione Query: Blockbuster da Saga");
    const sagaPreset = presets.find(p => p.id === 'preset_franchise_blockbusters');
    if (sagaPreset) {
        const sql = tmdbToSqlTranslator.buildSqlFromTmdbQuery(sagaPreset.queries[0], 'movie');
        console.log("SQL Generato:\n" + sql);
    }

    // 4. Test Ordinamenti Temporali
    console.log("\n[4] Traduzione Query: Sort by first_air_date per TV");
    const testQuery = { strategy: 'discovery', sort_by: 'first_air_date.desc', 'vote_count.gte': 100 };
    const sqlSort = tmdbToSqlTranslator.buildSqlFromTmdbQuery(testQuery, 'tv');
    console.log("SQL Generato:\n" + sqlSort);

    duckDbStore.close();
    console.log("\n=== TEST COMPLETATO ===");
}

testFilters().catch(console.error);
