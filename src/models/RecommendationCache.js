const CacheManager = require('../cache/CacheManager');
const { RECOMMENDATIONS_CACHE_TTL_MS } = require('../config');

/**
 * L2 Cache for personalized recommendations.
 * Stores the final list of TMDB IDs for a given user context and catalog type.
 */
module.exports = new CacheManager('recommendation_cache', {
    ramMax: 30,
    ramTtlMs: RECOMMENDATIONS_CACHE_TTL_MS,  // 4 hours
    mongoTtlMs: RECOMMENDATIONS_CACHE_TTL_MS, // 4 hours
    swrMs: 60 * 60 * 1000                     // 1 hour SWR
});
