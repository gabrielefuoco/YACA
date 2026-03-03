const CacheManager = require('../cache/CacheManager');
const { CACHE_TTL_MS } = require('../config');

// L2 TTL: 24 ore (86400000 ms) per i cataloghi TMDB
const cacheManager = new CacheManager('tmdb_catalog', {
    ramMax: 300,
    ramTtlMs: 300000,
    mongoTtlMs: 86400000
});

const TmdbRequestCache = {
    /**
     * @param {string} requestHash
     * @param {number} ttlMs - staleness threshold in ms
     * @returns {Promise<{ stremioData: Array, isStale: boolean } | null>}
     */
    async get(requestHash, ttlMs = CACHE_TTL_MS) {
        const entry = await cacheManager.get(requestHash);
        if (!entry) return null;

        const age = Date.now() - entry.updatedAt;
        return {
            stremioData: entry.stremioData,
            isStale: age > ttlMs
        };
    },

    /**
     * @param {string} requestHash
     * @param {string} endpoint - kept for interface compatibility
     * @param {Array}  stremioData
     */
    async set(requestHash, endpoint, stremioData) {
        await cacheManager.set(requestHash, {
            stremioData,
            updatedAt: Date.now()
        });
    },

    /**
     * @returns {Promise<{ deleted: boolean }>}
     */
    async clear() {
        await cacheManager.clear();
        return { deleted: true };
    }
};

module.exports = TmdbRequestCache;
