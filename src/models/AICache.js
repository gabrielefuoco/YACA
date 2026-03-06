const CacheManager = require('../cache/CacheManager');

/**
 * L2 Cache for AI prompt routing.
 * Maps a natural language search prompt to a structured set of TMDB filters.
 */
module.exports = new CacheManager('ai_prompt_cache', {
    ramMax: 100,
    ramTtlMs: 1000 * 60 * 60 * 24, // 24h RAM
    mongoTtlMs: 1000 * 60 * 60 * 24 * 365 * 50 // 50 years (Unlimited)
});
