const CacheManager = require('./CacheManager');
const { RECOMMENDATIONS_CACHE_TTL_MS } = require('../config');

const FIFTY_YEARS_MS = 1000 * 60 * 60 * 24 * 365 * 50;
const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const TEN_MINUTES_MS = 1000 * 60 * 10;
const ONE_HOUR_MS = 1000 * 60 * 60;

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

module.exports = {
    aiPromptCache,
    aiDiscoveryCache,
    hybridRecommendationsCache
};
