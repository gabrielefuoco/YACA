const CacheManager = require('../cache/CacheManager');
const {
    FAST_CATALOG_PAGE1_L2_TTL_MS,
    FAST_CATALOG_PAGE1_SWR_MS
} = require('../config');

// Default TTL matches "fast catalog page 1" – individual catalog handlers
// may pass custom TTLs via options.cacheTtlMs depending on catalog speed tier.
module.exports = new CacheManager('tmdb_catalog', {
    ramMax: 50,
    ramTtlMs: FAST_CATALOG_PAGE1_L2_TTL_MS,  // 30 min L1
    mongoTtlMs: FAST_CATALOG_PAGE1_L2_TTL_MS, // 30 min L2 (overridden per-call)
    swrMs: FAST_CATALOG_PAGE1_SWR_MS           // 15 min SWR window
});
