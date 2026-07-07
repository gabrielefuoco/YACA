require('dotenv').config();
const CacheManager = require('../src/cache/CacheManager');
const redisClient = require('../src/cache/redisClient');
// Includiamo cacheInstances per farle registrare su CacheManager.instances
require('../src/cache/cacheInstances');

async function clearCaches() {
    try {
        console.log("Attesa connessione a Redis...");
        // Breve attesa per permettere la connessione
        await new Promise(r => setTimeout(r, 1000));
        
        if (redisClient.isAvailable) {
            await redisClient.flushdb();
            console.log("Tutto il database Redis è stato svuotato con successo.");
        } else {
            console.log("Redis non disponibile, impossibile svuotare la cache.");
        }

        console.log("Disconnessione...");
        await redisClient.quit();
        process.exit(0);
    } catch (e) {
        console.error("Errore durante la pulizia della cache:", e);
        process.exit(1);
    }
}

clearCaches();
