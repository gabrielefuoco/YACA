const LRUCache = require('../utils/LRUCache');
const { CACHE_TTL_MS } = require('../config');

const cache = new LRUCache({ max: 300 });

const TmdbRequestCache = {
    /**
     * @param {string} requestHash
     * @param {number} ttlMs - staleness threshold in ms
     * @returns {{ stremioData: Array, isStale: boolean } | null}
     */
    get(requestHash, ttlMs = CACHE_TTL_MS) {
        const entry = cache.get(requestHash);
        if (!entry) return null;

        const age = Date.now() - entry.updatedAt;
        return { stremioData: entry.stremioData, isStale: age > ttlMs };
    },

    /**
     * @param {string} requestHash
     * @param {string} endpoint - kept for interface compatibility
     * @param {Array}  stremioData
     */
    set(requestHash, endpoint, stremioData) {
        cache.set(requestHash, { stremioData, updatedAt: Date.now() });
    },

    /**
     * @returns {{ deleted: boolean }}
     */
    clear() {
        cache.clear();
        return { deleted: true };
    }
};

module.exports = TmdbRequestCache;
