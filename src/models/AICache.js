const CacheManager = require('../cache/CacheManager');

/**
 * L2 Cache for AI prompt routing.
 * Maps a natural language search prompt to a structured set of TMDB filters.
 */
const cacheManager = new CacheManager('ai_prompt_cache', {
    ramMax: 100,
    ramTtlMs: 1000 * 60 * 60 * 24, // 24h RAM
    mongoTtlMs: 1000 * 60 * 60 * 24 * 365 * 50 // 50 years (Unlimited)
});

const AICache = {
    async get(prompt) {
        const key = prompt.toLowerCase().trim();
        const entry = await cacheManager.get(key);
        if (!entry) return null;

        const age = Date.now() - (entry.updatedAt || 0);
        return {
            filters: entry.filters || entry,
            isStale: age > 1000 * 60 * 10 // 10 minutes SWR
        };
    },

    async set(prompt, filters) {
        const key = prompt.toLowerCase().trim();
        await cacheManager.set(key, {
            filters,
            updatedAt: Date.now()
        });
    },

    async clear() {
        await cacheManager.clear();
    }
};

module.exports = AICache;
