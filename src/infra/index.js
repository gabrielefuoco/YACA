/**
 * src/infra/index.js — Impianto infrastrutturale condiviso di YACA (Ticket 42).
 *
 * Raccoglie l'impianto trasversale e privo di semantica di dominio:
 * - retry: tentativi con backoff esponenziale e classificazione errori
 * - LRUCache: cache LRU pura in memoria con TTL
 * - axiosClient: factory client HTTP con retry su 429
 * - mongoConnect: connessione resiliente a MongoDB per timer e script
 * - rateLimiter: rate limiting per promesse e array
 * - logger: persistenza errori di sistema
 * - snapshotDaArtefatto: cache L1 unificata in RAM con single-flight
 * - helpers: utility condivise (sanitizzazione stringhe, URL, parsing Stremio)
 * - resultMerger: interleaving e consensus scoring multi-query
 */

const retry = require('./retry');
const LRUCache = require('./LRUCache');
const axiosClient = require('./axiosClient');
const mongoConnect = require('./mongoConnect');
const rateLimiter = require('./rateLimiter');
const logger = require('./logger');
const snapshotDaArtefatto = require('./snapshotDaArtefatto');
const helpers = require('./helpers');
const resultMerger = require('./resultMerger');

module.exports = {
    // Retry & Resilienza
    ...retry,
    // Caching
    LRUCache,
    ...snapshotDaArtefatto,
    // HTTP & Rete
    ...axiosClient,
    // Database
    ...mongoConnect,
    // Concorrenza & Rate Limiting
    ...rateLimiter,
    // Logging
    ...logger,
    // Helpers trasversali
    ...helpers,
    // Fusione risultati
    ...resultMerger
};
