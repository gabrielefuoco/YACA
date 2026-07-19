const TmdbDumpStore = require('../src/utils/tmdbDumpStore');
const TmdbDumpClient = require('../src/utils/tmdbDumpClient');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../secrets.env') });

async function runTest() {
    console.log("Inizializzo client e store...");
    const client = new TmdbDumpClient(process.env.TMDB_API_KEY);
    const store = new TmdbDumpStore();
    
    // forza basePath locale per il test
    store.basePath = path.resolve(__dirname, '../.cache/tmdb_test');
    if (!fs.existsSync(store.basePath)) {
        fs.mkdirSync(store.basePath, { recursive: true });
    }

    console.log("Base path:", store.basePath);

    const testIds = [550, 27205, 157336]; // Fight club, Inception, Interstellar
    console.log("Test fetching 3 movies...");

    const rows = [];
    for (const id of testIds) {
        const row = await client.fetchMovie(id);
        if (row) rows.push(row);
        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`Fetched ${rows.length} movies. Appending to store...`);
    store.appendBatch(rows, 'movies');

    console.log("Checking loaded IDs...");
    const ids = await store.loadIds('movies');
    console.log("IDs in store:", Array.from(ids));

    console.log("Test upsert (updating Fight club title)...");
    rows[0].title = "Fight Club - Updated";
    await store.upsert([rows[0]], 'movies');

    console.log("Test soft delete (deleting Inception - 27205)...");
    await store.deleteIds([27205], 'movies');

    const idsAfter = await store.loadIds('movies');
    console.log("IDs in store after upsert & delete:", Array.from(idsAfter));

    const finalPath = store._getFilePath('movies');
    const content = fs.readFileSync(finalPath, 'utf8');
    console.log("\nFinal file content lines:", content.split('\n').length - 1);
    
    console.log("Test completato con successo!");
}

runTest().catch(console.error);
