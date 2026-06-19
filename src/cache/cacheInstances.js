const CacheManager = require('./CacheManager');
const { RECOMMENDATIONS_CACHE_TTL_MS } = require('../config');

const FIFTY_YEARS_MS = 1000 * 60 * 60 * 24 * 365 * 50;
const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const TEN_MINUTES_MS = 1000 * 60 * 10;
const ONE_HOUR_MS = 1000 * 60 * 60;

// 10 minutes fresh + 24 hours SWR keeps AI prompt results hot in L1
// while still refreshing them aggressively in background.
const aiPromptCache = new CacheManager('ai_prompt_cache', {
    ramMax: 100,
    ramTtlMs: TEN_MINUTES_MS,
    mongoTtlMs: FIFTY_YEARS_MS,
    swrMs: ONE_DAY_MS
});

const aiDiscoveryCache = new CacheManager('ai_discovery_queries', {
    ramMax: 100,
    ramTtlMs: ONE_HOUR_MS,
    mongoTtlMs: FIFTY_YEARS_MS,
    swrMs: ONE_DAY_MS
});

const hybridRecommendationsCache = new CacheManager('recommendation_cache', {
    ramMax: 30,
    ramTtlMs: RECOMMENDATIONS_CACHE_TTL_MS,
    mongoTtlMs: RECOMMENDATIONS_CACHE_TTL_MS,
    swrMs: ONE_HOUR_MS
});

const catalogFallbackCache = new CacheManager('catalog_fallback', {
    ramMax: 500,
    ramTtlMs: TEN_MINUTES_MS,
    mongoTtlMs: ONE_DAY_MS,
    swrMs: ONE_HOUR_MS
});

/**
 * Cache for refined/processed catalog requests (the high-level orchestrator cache)
 * Uses the same namespace as preWarm to leverage pre-filled data.
 */
const catalogRequestCache = new CacheManager('tmdb_catalog', {
    ramMax: 500,
    ramTtlMs: TEN_MINUTES_MS,
    mongoTtlMs: ONE_DAY_MS,
    swrMs: ONE_HOUR_MS
});

const simulcastDatesCache = new CacheManager('simulcast_dates', {
    ramMax: 300,
    ramTtlMs: ONE_HOUR_MS * 12, // 12 ore RAM
    mongoTtlMs: ONE_DAY_MS * 7,   // 7 giorni MongoDB cache
    swrMs: ONE_HOUR_MS * 6      // 6 ore SWR
});

module.exports = {
    aiPromptCache,
    aiDiscoveryCache,
    hybridRecommendationsCache,
    catalogFallbackCache,
    catalogRequestCache,
    simulcastDatesCache
};
