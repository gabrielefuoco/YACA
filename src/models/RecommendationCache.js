const CacheManager = require('../cache/CacheManager');

/**
 * L2 Cache for personalized recommendations.
 * Stores the final list of TMDB IDs for a given user context and catalog type.
 */
module.exports = new CacheManager('recommendation_cache', {
    ramMax: 20,
    ramTtlMs: 300000, // 5 min RAM
    mongoTtlMs: 1000 * 60 * 60 * 24 // 24h MongoDB
});
