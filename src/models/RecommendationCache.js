const CacheManager = require('../cache/CacheManager');

/**
 * L2 Cache for personalized recommendations.
 * Stores the final list of TMDB IDs for a given user context and catalog type.
 */
const cacheManager = new CacheManager('recommendation_cache', {
    ramMax: 20,
    ramTtlMs: 300000, // 5 min RAM
    mongoTtlMs: 1000 * 60 * 60 * 24 // 24h MongoDB
});

const RecommendationCache = {
    async get(key) {
        const entry = await cacheManager.get(key);
        if (!entry) return null;

        return {
            ids: entry.ids,
            isStale: age > 1000 * 60 * 60 * 4 // 4h staleness threshold for background refresh
        };
    },

    async set(key, ids) {
        await cacheManager.set(key, {
            ids,
            updatedAt: Date.now()
        });
    },

    async clear() {
        await cacheManager.clear();
    }
};

module.exports = RecommendationCache;
