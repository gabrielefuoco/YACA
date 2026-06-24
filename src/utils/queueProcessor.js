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

async function triggerBinarySearch(baseId, testUserConfig, hostUrl, iteration = 0) {
    if (iteration === 0) console.log(`[BinarySearch] Checking for offset on series ${baseId}...`);
    
    try {
        const badges = await StreamBadge.find({ baseId }).lean();
        const itaBadges = badges.filter(b => b.hasIta === true);
        const noItaBadges = badges.filter(b => b.hasIta === false);

        if (itaBadges.length === 0 || noItaBadges.length === 0) {
            if (iteration === 0) console.log(`[BinarySearch] No offset possible for ${baseId} yet (need both ITA and NO ITA episodes).`);
            return;
        }

        const getEpNum = (stremioId) => parseInt(stremioId.split(':').pop()) || 0;

        const maxIta = Math.max(...itaBadges.map(b => getEpNum(b.stremioId)));
        const sortedNoIta = noItaBadges.map(b => getEpNum(b.stremioId)).sort((a, b) => a - b);
        const nextNoIta = sortedNoIta.find(ep => ep > maxIta);

        if (!nextNoIta) {
            if (iteration === 0) console.log(`[BinarySearch] No gap found for ${baseId} (all checked episodes after E${maxIta} are ITA).`);
            return;
        }

        if (nextNoIta - maxIta <= 1) {
            console.log(`[BinarySearch] Boundary found! Last ITA is E${maxIta}, first NO ITA is E${nextNoIta}.`);
            return;
        }

        const gap = nextNoIta - maxIta;
        // Max iterations = log2(gap) + 3 (per sicurezza sui fallback iniziali)
        const maxIterations = Math.ceil(Math.log2(gap)) + 3;
        
        if (iteration > maxIterations) {
            console.error(`[BinarySearch] Max iterations (${maxIterations}) reached for ${baseId} (gap: ${gap}). Aborting.`);
            return;
        }

        let midEp;
        // Euristiche per simulcast: il doppiaggio di solito è indietro di 1 o 2 episodi rispetto al sub
        if (iteration === 0 && gap > 1) {
            midEp = nextNoIta - 1;
        } else if (iteration === 1 && gap > 2) {
            midEp = nextNoIta - 2;
        } else {
            // Normale ricerca binaria matematica
            midEp = Math.floor((maxIta + nextNoIta) / 2);
        }
        
        const templateBadge = noItaBadges.find(b => getEpNum(b.stremioId) === nextNoIta);
        const parts = templateBadge.stremioId.split(':');
        parts[parts.length - 1] = String(midEp);
        const midStremioId = parts.join(':');

        if (iteration === 0) console.log(`[BinarySearch] Gap detected between E${maxIta} and E${nextNoIta}. Checking midpoint E${midEp}...`);

        await new Promise(r => setTimeout(r, 1000));
        await streamHandler({ id: midStremioId, type: 'series' }, testUserConfig, hostUrl);
        await triggerBinarySearch(baseId, testUserConfig, hostUrl, iteration + 1);
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

        console.log(`[QueueProcessor] Processing ${pendingItems.length} pending items...`);

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
                console.log(`[QueueProcessor] Scanning streams for ${testId} (type: ${item.type})...`);

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
                    console.log(`[QueueProcessor] Successfully processed and removed ${item.baseId}`);
                } catch (err) {
                    console.error(`[QueueProcessor] Error processing ${item.baseId}:`, err.message);
                    // DELETE failed items so they don't bloat the DB. 
                    // They will be re-queued naturally by the next catalog request.
                    await PendingScan.deleteOne({ _id: item._id });
                }
            },
            { batchSize: 2, delayMs: 1500 }
        );

        console.log('[QueueProcessor] Queue processing completed.');
    } catch (e) {
        console.error('[QueueProcessor] Fatal error in QueueProcessor:', e.message);
    }
}

module.exports = { processPendingScans };
