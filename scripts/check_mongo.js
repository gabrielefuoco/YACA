require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Check cacheentries for the kitsu:46859 catalog meta
    const coll = db.collection('cacheentries');
    const doc = await coll.findOne({ key: { $regex: '46859' } });
    if (doc) {
        const val = typeof doc.value === 'string' ? JSON.parse(doc.value) : doc.value;
        console.log('Found cache entry, key:', doc.key);
        console.log('tmdbId in cached value:', val?.tmdbId);
        console.log('imdbId in cached value:', val?.imdbId);
        console.log('Top-level keys:', Object.keys(val || {}));
    } else {
        console.log('No entry found for 46859 in cacheentries');
    }

    // Also check caches
    const caches = db.collection('caches');
    const doc2 = await caches.findOne({ key: { $regex: '46859' } });
    if (doc2) {
        console.log('\nFound in caches, key:', doc2.key);
    }

    await mongoose.disconnect();
})();
