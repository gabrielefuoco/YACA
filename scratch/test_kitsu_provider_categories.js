require('dotenv').config();
const mongoose = require('mongoose');
const { getKitsuCatalogFromFilters } = require('../src/catalog/providers/KitsuProvider');

async function testProviderFilters() {
    console.log("=== STARTING KITSU PROVIDER FILTERS TEST ===");
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected.");
    
    // Test with category + rating + ageRating (Censura)
    const filters = {
        _keywordNames: 'action',
        voteMin: 8.0,
        certificationLte: 'PG'
    };

    try {
        console.log("Calling getKitsuCatalogFromFilters with voteMin = 8.0, certificationLte = 'PG'...");
        const results = await getKitsuCatalogFromFilters(filters, 'series', 0);
        console.log(`Returned ${results.length} items.`);
        results.slice(0, 10).forEach((item, idx) => {
            console.log(`[${idx + 1}] Title: "${item.name}" | Rating: ${item.imdbRating} | Date: ${item.releaseInfo} | ID: ${item.id}`);
        });
    } catch (e) {
        console.error("Error during test:", e);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
    }
}

testProviderFilters();
