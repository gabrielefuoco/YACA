require('dotenv').config();
const animeMappingStore = require('./src/data/animeMappingStore');

async function test() {
    await animeMappingStore.init();
    
    console.log("MAL 21 ->", animeMappingStore.resolveTmdbFromMal(21));
    console.log("MAL 16498 ->", animeMappingStore.resolveTmdbFromMal(16498));
    
    // Find any malId that results in [object Object]
    for (const [mal, tmdb] of animeMappingStore.malToTmdb.entries()) {
        if (typeof tmdb === 'string' && tmdb.includes('Object')) {
            console.log(`Found Object TMDB ID for MAL ${mal}:`, tmdb);
        }
    }
    process.exit(0);
}

test();
