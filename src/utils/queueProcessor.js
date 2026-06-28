const PendingScan = require('../db/models/PendingScan');
const StreamBadge = require('../db/models/StreamBadge');
const { streamHandler } = require('../handlers/streamHandler');
const { rateLimitedMap } = require('./rateLimiter');

function getSeriesBaseId(stremioId) {
    if (!stremioId) return '';
    const parts = stremioId.split(':');
    if (stremioId.startsWith('tmdb:tv:')) {
        return parts.slice(0, 3).join(':'); // tmdb:tv:1234
    }
    return parts.slice(0, 2).join(':'); // kitsu:1234 or tt12345
}

async function triggerBinarySearch(baseId, testUserConfig, hostUrl) {
    // console.log(`[BinarySearch] Checking for offset on series ${baseId}...`);
    try {
        const badges = await StreamBadge.find({ baseId }).lean();
        const itaBadges = badges.filter(b => b.hasIta === true);
        const noItaBadges = badges.filter(b => b.hasIta === false);

        if (itaBadges.length === 0 || noItaBadges.length === 0) {
            // console.log(`[BinarySearch] No offset possible for ${baseId} yet (need both ITA and NO ITA episodes).`);
            return;
        }

        const getEpNum = (stremioId) => {
            const parts = stremioId.split(':');
            return parseInt(parts[parts.length - 1]) || 0;
        };

        const sortedIta = itaBadges.map(b => getEpNum(b.stremioId)).sort((a, b) => a - b);
        const sortedNoIta = noItaBadges.map(b => getEpNum(b.stremioId)).sort((a, b) => a - b);

        const maxIta = sortedIta[sortedIta.length - 1];
        const nextNoIta = sortedNoIta.find(ep => ep > maxIta);

        if (!nextNoIta) {
            // console.log(`[BinarySearch] No gap found for ${baseId} (all checked episodes after E${maxIta} are ITA).`);
            return;
        }

        if (nextNoIta - maxIta <= 1) {
            // console.log(`[BinarySearch] Boundary found! Last ITA is E${maxIta}, first NO ITA is E${nextNoIta}.`);
            return;
        }

        const midEp = Math.floor((maxIta + nextNoIta) / 2);
        
        // Ricostruiamo lo stremioId per midEp sostituendo l'ultimo frammento dell'ID dell'episodio nextNoIta
        const templateBadge = noItaBadges.find(b => getEpNum(b.stremioId) === nextNoIta);
        const parts = templateBadge.stremioId.split(':');
        parts[parts.length - 1] = String(midEp);
        const midStremioId = parts.join(':');

        // console.log(`[BinarySearch] Gap detected between E${maxIta} and E${nextNoIta}. Checking midpoint E${midEp} (${midStremioId})...`);

        // Ritardo di 1 secondo per evitare rate limiting sui server upstream
        await new Promise(r => setTimeout(r, 1000));

        await streamHandler(
            { id: midStremioId, type: 'series' },
            testUserConfig,
            hostUrl
        );

        // Ricorsione per continuare a dimezzare l'intervallo
        await triggerBinarySearch(baseId, testUserConfig, hostUrl);

    } catch (err) {
        console.error(`[BinarySearch] Error in triggerBinarySearch for ${baseId}:`, err.message);
    }
}

async function processPendingScans(hostUrl) {
    console.log('[QueueProcessor] Checking for pending scans...');
    try {
        const pendingItems = await PendingScan.find({ status: 'pending' }).limit(100).lean();
        if (pendingItems.length === 0) {
            console.log('[QueueProcessor] No pending items in queue.');
            return;
        }

        // console.log(`[QueueProcessor] Processing ${pendingItems.length} pending items...`);

        const testUserConfig = {
            userId: 'cache_warmer',
            apiKeys: { tmdb: process.env.TMDB_API_KEY }
        };

        // Process sequentially with a 1-second delay
        await rateLimitedMap(
            pendingItems,
            async (item) => {
                const parts = item.baseId.split(':');
                const testId = parts.length >= 3 ? item.baseId : (item.type === 'series' ? `${item.baseId}:1:1` : item.baseId);
                // console.log(`[QueueProcessor] Scanning streams for ${testId} (type: ${item.type})...`);

                try {
                    // Call streamHandler to fetch streams, detect ITA, and save badge
                    await streamHandler(
                        { id: testId, type: item.type },
                        testUserConfig,
                        hostUrl
                    );
                    
                    // Se è una serie, controlliamo se c'è bisogno di una ricerca binaria in background
                    if (item.type === 'series') {
                        const baseSeriesId = getSeriesBaseId(testId);
                        await triggerBinarySearch(baseSeriesId, testUserConfig, hostUrl);
                    }
                    
                    // Delete from pending scans on success
                    await PendingScan.deleteOne({ _id: item._id });
                    // console.log(`[QueueProcessor] Successfully processed and removed ${item.baseId}`);
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
