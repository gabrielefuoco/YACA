require('dotenv').config();
const mongoose = require('mongoose');
const { getKitsuIdFromTmdb } = require('../src/utils/TmdbToKitsuMapper');

async function run() {
    const tmdbId = process.argv[2];
    if (!tmdbId) {
        console.error("Uso: node test_kitsu_offset.js <TMDB_ID>");
        process.exit(1);
    }
    
    console.log(`[TMDB->Kitsu] Risoluzione TMDB ID: ${tmdbId} ...`);
    
    try {
        if (process.env.MONGODB_URI) {
            await mongoose.connect(process.env.MONGODB_URI);
        }
        const kitsuId = await getKitsuIdFromTmdb(tmdbId);
        console.log(`\nRisultato del mapping:`);
        console.log(`> ${kitsuId}`);
    } catch (e) {
        console.error("Errore durante il mapping:", e.message);
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        process.exit(0);
    }
}
run();
