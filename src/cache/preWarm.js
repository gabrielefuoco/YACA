const CacheEntry = require('../models/CacheEntry');
const { getRedisClient, isRedisAvailable, waitForRedisReady } = require('./redisClient');
const { PREWARM_PAGES, PREWARM_PRESET_IDS } = require('../config');

/**
 * Boot Pre-Warming: loads pages 1 and 2 of popular catalog presets
 * from MongoDB (L2) into Redis (L1) so first requests after a container
 * restart have zero latency.
 *
 * Only runs if Redis is available. Silently skips if no data in L2.
 */
async function preWarmRedisFromMongo() {
    const redis = getRedisClient();
    const redisReady = await waitForRedisReady();

    if (!redisReady || !isRedisAvailable()) {
        console.log('[PreWarm] Redis not available, skipping pre-warm.');
        return;
    }

    const pagesLoaded = [];

    try {
        // Use MongoDB $regex to filter pages server-side instead of loading all entries
        const regexPattern = new RegExp(`:page:(${PREWARM_PAGES.join('|')})$`);

        const entries = await CacheEntry.find({
            namespace: 'tmdb_catalog',
            key: { $regex: regexPattern },
            expiresAt: { $gt: new Date() }
        }).lean();

        for (const entry of entries) {
            // Build the envelope that CacheManager expects: { v: value, t: storedAtMs }
            // Intentionally use Date.now() so the L1 SWR clock starts fresh after reboot,
            // giving users a full fresh window before background revalidation kicks in.
            const envelope = { v: entry.value, t: Date.now() };
            const redisKey = `tmdb_catalog:${entry.key}`;

            // Compute remaining TTL from MongoDB expiresAt
            const remainingMs = new Date(entry.expiresAt).getTime() - Date.now();
            if (remainingMs <= 0) continue;

            const ttlSec = Math.ceil(remainingMs / 1000);
            await redis.set(redisKey, JSON.stringify(envelope), 'EX', ttlSec);
            pagesLoaded.push(entry.key);
        }

        if (pagesLoaded.length > 0) {
            console.log(`[PreWarm] Loaded ${pagesLoaded.length} catalog pages from MongoDB → Redis.`);
        } else {
            console.log('[PreWarm] No catalog pages found in MongoDB to pre-warm.');
        }
    } catch (err) {
        console.error('[PreWarm] Error during pre-warm:', err.message);
    }
}

module.exports = { preWarmRedisFromMongo };
