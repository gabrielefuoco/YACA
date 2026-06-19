require('dotenv').config();
const mongoose = require('mongoose');
const tmdb = require('../src/clients/tmdb');
const { executeUniversalPipeline } = require('../src/catalog/providers/AiDiscoveryProvider');
const { simulcastDatesCache } = require('../src/cache/cacheInstances');

async function testSimulcastSorting() {
    console.log("=== STARTING SIMULCAST SORTING PIPELINE TEST ===");
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected.");

    const tmdbApiKey = process.env.TMDB_API_KEY;
    if (!tmdbApiKey) {
        console.error("TMDB API Key missing!");
        await mongoose.disconnect();
        return;
    }

    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);

    // Build today, yesterday, tomorrow dates
    const today = new Date();
    const yesterdayStr = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const tomorrowStr = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const simulcastCatalog = {
        presentation_strategy: 'popularity',
        queries: [{
            provider: 'tmdb',
            strategy: 'discovery',
            with_original_language: 'ja',
            with_genres: '16', // Animation
            'air_date.gte': yesterdayStr,
            'air_date.lte': tomorrowStr
        }]
    };

    try {
        console.log("\n--- RUN 1: Cache is empty (Should sort by popularity initially) ---");
        // Clear simulcast cache first to simulate cold start
        await mongoose.connection.collection('cacheentries').deleteMany({ namespace: 'simulcast_dates' });
        simulcastDatesCache.clear_caches && simulcastDatesCache.clear_caches(); // clear RAM
        
        let results = await executeUniversalPipeline(simulcastCatalog, tmdbClient, tmdbApiKey, 'series', 0, {}, {});
        console.log(`Returned ${results.length} items.`);
        
        results.slice(0, 5).forEach((item, idx) => {
            console.log(`[${idx + 1}] Title: "${item.name}" | ID: ${item.id}`);
        });

        console.log("\nWaiting 4 seconds for background tasks to populate cache...");
        await new Promise(r => setTimeout(r, 4000));

        console.log("\n--- RUN 2: Cache is now populated (Should sort chronologically by latest air date) ---");
        results = await executeUniversalPipeline(simulcastCatalog, tmdbClient, tmdbApiKey, 'series', 0, {}, {});
        console.log(`Returned ${results.length} items.`);
        
        // Print items and also lookup their cached dates to output in logs
        for (let i = 0; i < Math.min(results.length, 10); i++) {
            const item = results[i];
            const tmdbId = item.id.replace('tmdb:series:', '').replace('tmdb:', '');
            const cacheVal = await simulcastDatesCache.get(String(tmdbId));
            const dateStr = cacheVal ? cacheVal.latestAirDate : 'N/A';
            console.log(`[${i + 1}] Title: "${item.name}" | Latest Ep Date: ${dateStr} | ID: ${item.id}`);
        }

    } catch (e) {
        console.error("Error during test:", e);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
}

testSimulcastSorting();
