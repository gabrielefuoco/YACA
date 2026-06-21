const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { streamHandler } = require('../src/handlers/streamHandler');
const { catalogHandler } = require('../src/handlers/catalogHandler');
const StreamBadge = require('../src/db/models/StreamBadge');

process.env.PROXY_ADDON_URL = "https://icv.stremio-italia.eu/eyJ0bWRiX2tleSI6IjU0NjJmNzg0NjlmM2Q4MGJmNTIwMTY0NTI5NGMxNmU0IiwidXNlX2NvcnNhcm9uZXJvIjpmYWxzZSwidXNlX3VpbmRleCI6ZmFsc2UsInVzZV9rbmFiZW4iOnRydWUsInVzZV90b3JyZW50Z2FsYXh5Ijp0cnVlLCJ1c2VfdG9ycmVudGlvIjp0cnVlLCJ1c2VfbWVkaWFmdXNpb24iOnRydWUsInVzZV9jb21ldCI6dHJ1ZSwidXNlX3N0cmVtdGhydV90b3J6Ijp0cnVlLCJ1c2VfbWV0ZW9yIjp0cnVlLCJ1c2VfcmFyYmciOnRydWUsInVzZV9qYWNrZXR0Ijp0cnVlLCJmdWxsX2l0YSI6ZmFsc2UsImRiX29ubHkiOmZhbHNlLCJ1c2VfZ2xvYmFsX2NhY2hlIjpmYWxzZSwib25seV9kZWJyaWRfY2FjaGUiOmZhbHNlLCJoeWJyaWRfbW9kZSI6dHJ1ZSwiZm9ybWF0dGVyX3ByZXNldCI6Iml0YWxpYW5vIn0";

async function runTest() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected.\n");

        const testId = "tt15239678"; // Dune Part 2
        const testType = "movie";

        console.log(`[1] Clearing existing cache for ${testId}...`);
        await StreamBadge.deleteMany({ baseId: testId });

        console.log(`[2] Triggering StreamProxy for ${testId}...`);
        const streamsResult = await streamHandler(
            { type: testType, id: testId }, 
            {}, // Mock userConfig
            "http://localhost:7860"
        );
        
        console.log(`[3] Streams received: ${streamsResult.streams.length}`);
        
        const badge = await StreamBadge.findOne({ stremioId: testId });
        console.log(`[4] Badge created in DB:`, badge);

        console.log(`\n[5] Simulating catalog formatting...`);
        const { formatStremioCatalog } = require('../src/catalog/formatters/StremioFormatter');
        
        // Mock catalog results
        const mockResults = [
            { id: testId, type: testType, name: "Dune: Part Two", poster: "https://image.tmdb.org/t/p/w500/xyz.jpg" },
            { id: "tt0000000", type: testType, name: "Film Senza Stream", poster: "https://image.tmdb.org/t/p/w500/abc.jpg" }
        ];

        // Manually apply the logic from catalogHandler
        const itemIds = mockResults.map(i => i.id);
        const badges = await StreamBadge.find({ baseId: { $in: itemIds }, hasIta: true }).lean();
        const itaBaseIds = new Set(badges.map(b => b.baseId));
        mockResults.forEach(item => {
            if (itaBaseIds.has(item.id)) {
                item._itaBadge = true;
            }
        });

        const formatted = formatStremioCatalog(mockResults, "mock", testType, {}, false, "http://localhost:7860", {});
        console.log("[6] Formatted Metas:");
        formatted.metas.forEach(m => {
            console.log(`- ${m.name}`);
            console.log(`  Poster URL: ${m.poster}`);
        });

    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        await mongoose.disconnect();
    }
}

runTest();
