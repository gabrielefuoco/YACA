const CacheManager = require('../cache/CacheManager');
const { CACHE_TTL_MS } = require('../config');

// L2 TTL: 24 ore (86400000 ms) per i cataloghi TMDB
const cacheManager = new CacheManager('tmdb_catalog', {
    ramMax: 50,
    ramTtlMs: 300000,
    mongoTtlMs: 86400000
});

const TmdbRequestCache = {
    /**
     * @param {string} requestHash
     * @param {number} ttlMs - staleness threshold in ms
     * @returns {Promise<{ stremioData: Array, isStale: boolean, nextPage: number } | null>}
     */
    async get(requestHash, ttlMs = CACHE_TTL_MS) {
        const entry = await cacheManager.get(requestHash);
        if (!entry) return null;

        const age = Date.now() - entry.updatedAt;
        return {
            stremioData: entry.stremioData,
            nextPage: entry.nextPage || 1,
            isStale: age > ttlMs
        };
    },

    /**
     * @param {string} requestHash
     * @param {string} endpoint - kept for interface compatibility
     * @param {Array}  stremioData
     * @param {number} nextPage
     * @param {object} options - (Opzionale) { useRam: boolean }
     */
    async set(requestHash, endpoint, stremioData, nextPage = 1, options = {}) {
        let updatedAt = Date.now();

        // Se stiamo aggiungendo pagine (nextPage > 1), cerchiamo di preservare 
        // la data di creazione originale per non resettare il TTL del catalogo intero
        if (nextPage > 1 || nextPage === -1) { // -1 as a flag if needed
            const existing = await cacheManager.get(requestHash);
            if (existing) {
                if (nextPage === 1 || nextPage === -1) {
                    // logic to keep nextPage it if not provided
                    nextPage = nextPage === -1 ? existing.nextPage : nextPage;
                }
                updatedAt = existing.updatedAt || updatedAt;
            }
        }

        await cacheManager.set(requestHash, {
            stremioData,
            nextPage,
            updatedAt
        }, null, options);
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
