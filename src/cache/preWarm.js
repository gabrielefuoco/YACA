const CacheEntry = require('../db/models/CacheEntry');
const { getRedisClient, isRedisAvailable } = require('./redisClient');
const { PREWARM_PAGES, PREWARM_PRESET_IDS } = require('../config');

/**
 * Boot Pre-Warming: loads pages 1 and 2 of popular catalog presets
 * from MongoDB (L2) into Redis (L1) so first requests after a container
 * restart have zero latency.
 *
 * Only runs if Redis is available. Silently skips if no data in L2.
 */
async function preWarmRedisFromMongo() {
    if (!isRedisAvailable()) {
        console.log('[PreWarm] Redis not available, skipping pre-warm.');
        return;
    }

    const redis = getRedisClient();
    const pagesLoaded = [];

    try {
        // Find all tmdb_catalog entries whose keys end with :page:1 or :page:2
        const pagePatterns = PREWARM_PAGES.map(p => `:page:${p}`);

        const entries = await CacheEntry.find({
            namespace: 'tmdb_catalog',
            expiresAt: { $gt: new Date() }
        }).lean();

        for (const entry of entries) {
            const matchesPage = pagePatterns.some(pat => entry.key.endsWith(pat));
            if (!matchesPage) continue;

            // Build the envelope that CacheManager expects: { v: value, t: storedAtMs }
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
