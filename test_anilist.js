require('dotenv').config();
const animeMappingStore = require('./src/data/animeMappingStore');
const { getAnilistSimulcastCatalog } = require('./src/catalog/providers/AnilistProvider');

async function test() {
    await animeMappingStore.init();
    console.log("Store initialized. malToTmdb size:", animeMappingStore.malToTmdb.size);
    const catalog = await getAnilistSimulcastCatalog(0, process.env.TMDB_API_KEY);
    console.log("Catalog length:", catalog.length);
    if (catalog.length > 0) {
        console.log("First item:", catalog[0].id, catalog[0].name);
    }
    process.exit(0);
}

test();
