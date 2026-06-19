require('dotenv').config();
const mongoose = require('mongoose');
const { getKitsuCatalogFromFilters } = require('../src/catalog/providers/KitsuProvider');

async function runTest() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("=== STARTING KITSU SORTING MAPPING TEST ===");
    
    const sorts = [
        { label: "Popolarità Decrescente (popularity.desc)", sortBy: "popularity.desc" },
        { label: "Voto Decrescente (vote_average.desc)", sortBy: "vote_average.desc" },
        { label: "Voto Crescente (vote_average.asc)", sortBy: "vote_average.asc" },
        { label: "Nuovi prima (release_date.desc)", sortBy: "release_date.desc" },
        { label: "Vecchi prima (release_date.asc)", sortBy: "release_date.asc" }
    ];
    
    // Standard filters for testing
    const baseFilters = {
        keyword: "action",
        _keywordNames: "action"
    };
    
    for (const s of sorts) {
        console.log(`\n🚀 Testing sort option: [${s.label}]`);
        const filters = {
            ...baseFilters,
            sort_by: s.sortBy
        };
        
        try {
            // Fetch 5 series items
            const results = await getKitsuCatalogFromFilters(filters, 'series', 0);
            console.log(`   Returned ${results.length} items.`);
            if (results.length > 0) {
                results.slice(0, 3).forEach((item, idx) => {
                    // Extract extra details from raw _kitsu_attributes
                    const score = item.imdbRating || "N/A";
                    const date = item.releaseInfo || "N/A";
                    console.log(`     [${idx + 1}] Title: "${item.name}" | Rating: ${score} | Date: ${date} | ID: ${item.id}`);
                });
            } else {
                console.log("     ⚠️ Empty results!");
            }
        } catch (err) {
            console.error(`   ❌ Error running kitsu catalog filters:`, err.message);
        }
    }
    
    console.log("\n=== TEST COMPLETE ===");
    await mongoose.disconnect();
}

runTest().catch(err => {
    console.error("Test failed:", err);
});
