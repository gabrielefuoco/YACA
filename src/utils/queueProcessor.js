const PendingScan = require('../db/models/PendingScan');
const { streamHandler } = require('../handlers/streamHandler');
const { rateLimitedMap } = require('./rateLimiter');

async function processPendingScans(hostUrl) {
    console.log('[QueueProcessor] Checking for pending scans...');
    try {
        const pendingItems = await PendingScan.find({ status: 'pending' }).limit(100).lean();
        if (pendingItems.length === 0) {
            console.log('[QueueProcessor] No pending items in queue.');
            return;
        }

        console.log(`[QueueProcessor] Processing ${pendingItems.length} pending items...`);

        const testUserConfig = {
            userId: 'cache_warmer',
            apiKeys: { tmdb: process.env.TMDB_API_KEY }
        };

        // Process sequentially with a 1-second delay (Cloudflare Worker dynamically distributes IPs)
        await rateLimitedMap(
            pendingItems,
            async (item) => {
                const testId = item.type === 'series' ? `${item.baseId}:1:1` : item.baseId;
                console.log(`[QueueProcessor] Scanning streams for ${testId} (type: ${item.type})...`);

                try {
                    // Call streamHandler to fetch streams, detect ITA, and save badge
                    await streamHandler(
                        { id: testId, type: item.type },
                        testUserConfig,
                        hostUrl
                    );
                    
                    // Delete from pending scans on success
                    await PendingScan.deleteOne({ _id: item._id });
                    console.log(`[QueueProcessor] Successfully processed and removed ${item.baseId}`);
                } catch (err) {
                    console.error(`[QueueProcessor] Error processing ${item.baseId}:`, err.message);
                    // Mark as failed so it doesn't block the queue
                    await PendingScan.updateOne({ _id: item._id }, { $set: { status: 'failed' } });
                }
            },
            { batchSize: 5, delayMs: 1000 }
        );

        console.log('[QueueProcessor] Queue processing completed.');
    } catch (e) {
        console.error('[QueueProcessor] Fatal error in QueueProcessor:', e.message);
    }
}

module.exports = { processPendingScans };
