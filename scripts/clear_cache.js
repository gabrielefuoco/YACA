require('dotenv').config({ path: 'secrets.env' });
const mongoose = require('mongoose');
const CacheEntry = require('./src/models/CacheEntry');

async function clearCache() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected. Deleting cache entries...");
        const result = await CacheEntry.deleteMany({});
        console.log(`Deleted ${result.deletedCount} cache entries.`);
    } catch (e) {
        console.error("Error clearing cache:", e);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
}

clearCache();
