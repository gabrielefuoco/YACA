require('dotenv').config();
const mongoose = require('mongoose');

async function clearCache() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // The collection name for CacheManager is 'CacheEntry' or similar?
    // Let's check CacheManager.js
    const { CacheEntry } = require('../src/cache/CacheManager');
    
    // Clear catalog_request_cache and anilist_catalog_cache
    if (CacheEntry) {
        await CacheEntry.deleteMany({ namespace: 'catalog_request_cache' });
        await CacheEntry.deleteMany({ namespace: 'anilist_catalog' });
        console.log("Caches cleared!");
    } else {
        console.log("CacheEntry model not found?");
        // Alternatively, clear all collections? No, just drop CacheEntry.
        const collections = await mongoose.connection.db.collections();
        for (let collection of collections) {
            if (collection.collectionName.toLowerCase().includes('cache')) {
                await collection.deleteMany({});
                console.log(`Cleared collection: ${collection.collectionName}`);
            }
        }
    }
    
    await mongoose.disconnect();
}

clearCache().catch(console.error);
