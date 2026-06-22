require('dotenv').config();
const mongoose = require('mongoose');
const CacheEntry = require('../src/models/CacheEntry');
const TmdbRequestCache = require('../src/models/TmdbRequestCache');

async function clearCaches() {
    try {
        if (!process.env.MONGODB_URI) {
            console.error("Errore: MONGODB_URI non è impostata nelle variabili d'ambiente.");
            process.exit(1);
        }
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connesso a MongoDB.");
        
        // 1. Svuota cache dei cataloghi (L2 cache)
        const cacheResult = await CacheEntry.deleteMany({});
        console.log(`Cancellati ${cacheResult.deletedCount} elementi da cacheentries.`);
        
        // 2. Svuota cache delle chiamate TMDB
        await TmdbRequestCache.clear();
        console.log(`Cancellata cache TMDB.`);
        
        await mongoose.disconnect();
        console.log("Disconnesso.");
    } catch (e) {
        console.error("Errore durante la pulizia della cache:", e);
        process.exit(1);
    }
}

clearCaches();
