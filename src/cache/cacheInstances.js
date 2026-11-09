const CacheManager = require('./CacheManager');
const { 
    RECOMMENDATIONS_CACHE_TTL_MS
} = require('../config');

const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const TEN_MINUTES_MS = 1000 * 60 * 10;
const ONE_HOUR_MS = 1000 * 60 * 60;
const ONE_MINUTE_MS = 1000 * 60;

const aiPromptCache = new CacheManager('ai_prompt_cache', {
    ramMax: 50,
    ramTtlMs: ONE_MINUTE_MS,
    redisTtlMs: ONE_MINUTE_MS
});

const aiDiscoveryCache = new CacheManager('ai_discovery_queries', {
    ramMax: 50,
    ramTtlMs: ONE_MINUTE_MS,
    redisTtlMs: ONE_MINUTE_MS
});

const hybridRecommendationsCache = new CacheManager('recommendation_cache', {
    ramMax: 30,
    ramTtlMs: RECOMMENDATIONS_CACHE_TTL_MS,
    redisTtlMs: RECOMMENDATIONS_CACHE_TTL_MS,
    swrMs: require('../config').RECOMMENDATIONS_SWR_MS
});

const catalogFallbackCache = new CacheManager('catalog_fallback', {
    ramMax: 100,
    ramTtlMs: TEN_MINUTES_MS,
    redisTtlMs: 14 * ONE_DAY_MS,
    swrMs: ONE_HOUR_MS
});

const catalogRequestCache = new CacheManager('tmdb_catalog', {
    ramMax: 0,
    ramTtlMs: TEN_MINUTES_MS,
    redisTtlMs: 14 * ONE_DAY_MS,
    swrMs: 12 * ONE_HOUR_MS
});

const simulcastDatesCache = new CacheManager('simulcast_dates', {
    ramMax: 100,
    ramTtlMs: ONE_HOUR_MS * 12,
    redisTtlMs: ONE_DAY_MS * 7,
    swrMs: ONE_HOUR_MS * 6
});

/**
 * Scaffali del profilo (`POST /scaffali` sul servizio del grafo).
 *
 * Costano ~4 secondi: sedici righe da sessanta titoli, ognuna con la sua diffusione,
 * piu' le controparti dell'altro medium. Ma il risultato cambia solo quando cambia la
 * storia dell'utente, i cursori o il grafo — non a ogni richiesta di un catalogo.
 *
 * TTL: due ore "fresche" e sei di stale-while-revalidate. Il limite vero e' piu' basso:
 * `eta_giorni` entra nella chiave, quindi la risposta scade comunque una volta al giorno
 * quando la freschezza dei semi cambia. Tenerla 24 ore in Redis e' sicuro proprio perche'
 * la chiave di domani sara' diversa.
 */
const shelvesCache = new CacheManager('shelves', {
    ramMax: 200,
    ramTtlMs: 2 * ONE_HOUR_MS,
    redisTtlMs: ONE_DAY_MS,
    swrMs: 6 * ONE_HOUR_MS
});

module.exports = {
    aiPromptCache,
    aiDiscoveryCache,
    hybridRecommendationsCache,
    catalogFallbackCache,
    catalogRequestCache,
    simulcastDatesCache,
    shelvesCache
};
