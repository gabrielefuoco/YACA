const { createTmdbClient, fetchTmdbCatalog } = require('../src/clients/tmdb');
const { getPresets } = require('../src/data/presets');
const { catalogHandler } = require('../src/handlers/catalogHandler');

require('dotenv').config();
const mongoose = require('mongoose');

// Re-enable cache for real testing
const TmdbRequestCache = require('../src/models/TmdbRequestCache');

async function run() {
    console.log("Testing Pagination...");

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Real Mongo connected');
    } catch (e) {
        console.error('Mongo connection failed:', e);
        process.exit(1);
    }

    // Simulate what stremio does
    const userConfig = {
        userId: "test-user-pagination",
        apiKeys: {
            tmdb: "c916a92d370eafd58eed86dd73e3dca0"
        },
        config: { hideWatched: false },
        profiles: [{ id: 'global' }]
    };

    const argsPage1 = {
        type: 'movie',
        id: 'yaca_discover_movies',
        extra: { skip: 0 }
    };

    const argsPage2 = {
        type: 'movie',
        id: 'yaca_discover_movies',
        extra: { skip: 40 }
    };

    const argsPage3 = {
        type: 'movie',
        id: 'yaca_discover_movies',
        extra: { skip: 80 }
    };

    try {
        const res1 = await catalogHandler(argsPage1, userConfig, "http://localhost:7000");
        const res2 = await catalogHandler(argsPage2, userConfig, "http://localhost:7000");
        const res3 = await catalogHandler(argsPage3, userConfig, "http://localhost:7000");

        const data = {
            page1: res1.metas?.map(m => m.id) || [],
            page2: res2.metas?.map(m => m.id) || [],
            page3: res3.metas?.map(m => m.id) || []
        };

        const overlap = data.page1.filter(id => data.page2.includes(id));

        console.log("\n\n=============== TEST RESULTS ===============");
        console.log("Page 1 count:", data.page1.length);
        console.log("Page 2 count:", data.page2.length);
        console.log("Page 3 count:", data.page3.length);
        console.log("Overlap between Page 1 and 2:", overlap.length);
        console.log("First element page 2:", data.page2[0], "Last:", data.page2[data.page2.length - 1]);
        console.log("============================================\n");

    } catch (e) {
        console.error("Test failed:", e);
    }

    process.exit(0);
}

run();
