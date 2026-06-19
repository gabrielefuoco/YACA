require('dotenv').config();
const mongoose = require('mongoose');
const CacheEntry = require('./src/models/CacheEntry');

async function clearCaches() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB.");
        
        const result = await CacheEntry.deleteMany({});
        console.log(`Deleted ${result.deletedCount} cache entries from MongoDB.`);
        
        await mongoose.disconnect();
        console.log("Disconnected.");
    } catch (e) {
        console.error("Error clearing caches:", e);
        process.exit(1);
    }
}

clearCaches();
