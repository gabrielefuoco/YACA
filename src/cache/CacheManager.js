const LRUCache = require('../infra/LRUCache');
const redisClient = require('./redisClient');

const NEGATIVE_CACHE_MARKER = '__NULL__';

/**
 * Quanto vive in cache una risposta VUOTA.
 *
 * Un catalogo vuoto è quasi sempre uno stato transitorio (fonte esterna giù, DuckDB non ancora
 * caldo, filtro che non trova nulla in questo istante): tenerlo per il TTL normale significa
 * congelare un guasto. Un minuto basta per non martellare la fonte e per far guarire la cache da
 * sola appena i dati tornano.
 */
const EMPTY_PAYLOAD_TTL_MS = 60 * 1000;

/**
 * Vero se il payload è "vuoto" nelle forme che la cache maneggia davvero: liste di catalogo
 * (`metas`), scaffali della home (`scaffali`), o un array nudo.
 */
function ePayloadVuoto(value) {
    if (Array.isArray(value)) return value.length === 0;
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value.metas)) return value.metas.length === 0;
    if (Array.isArray(value.scaffali)) return value.scaffali.length === 0;
    return false;
}

class CacheManager {
    static instances = [];

    /**
     * @param {string} namespace
     * @param {object} opts
     * @param {number} opts.ramMax      - Max items in L1 cache
     * @param {number} opts.ramTtlMs    - L1 TTL in ms
     * @param {number} opts.redisTtlMs  - L2 TTL in ms (Redis expiration)
     *
     * Non c'è una finestra stale-while-revalidate: ogni voce ha un solo TTL, e scaduto quello
     * si ricostruisce. Un `swrMs` esisteva ma non poteva mai attivarsi (la voce salvata porta
     * sempre il suo `ttl`, quindi la lettura calcolava sempre zero): è stato rimosso invece di
     * essere lasciato lì a far credere che il revalidate in background esista.
     */
    constructor(namespace, { ramMax = 200, ramTtlMs = 300000, redisTtlMs } = {}) {
        this.namespace = namespace;
        this.ramTtlMs = ramTtlMs;
        this.redisTtlMs = redisTtlMs || 86400000;

        // L1: Fast in-memory buffer to absorb burst requests
        this.lruFallback = new LRUCache({ max: ramMax, ttl: ramTtlMs });
        
        // Prevents thundering herd on cache miss
        this.activePromises = new Map();
        
        CacheManager.instances.push(this);
    }

    _getRedisKey(key) {
        return `${this.namespace}:${key}`;
    }

    // ─── Public API ───

    async getWithStatus(key) {
        // 1. Check L1
        const envelope = this.lruFallback.get(key);
        if (envelope !== undefined && envelope !== null) {
            if (typeof envelope === 'object' && 't' in envelope && 'v' in envelope) {
                const age = Date.now() - envelope.t;
                const effectiveRamTtl = envelope.ttl || this.ramTtlMs;
                if (age <= effectiveRamTtl) {
                    return { value: envelope.v === NEGATIVE_CACHE_MARKER ? null : envelope.v, status: 'fresh' };
                }
            } else {
                return { value: envelope === NEGATIVE_CACHE_MARKER ? null : envelope, status: 'fresh' };
            }
        }

        // 2. Check L2 (Redis)
        if (redisClient.isAvailable) {
            try {
                const rawData = await redisClient.get(this._getRedisKey(key));
                if (rawData) {
                    const parsed = JSON.parse(rawData);
                    if (parsed && typeof parsed === 'object' && 't' in parsed && 'v' in parsed) {
                        const originalTimestamp = parsed.t;
                        const age = Date.now() - originalTimestamp;
                        
                        // Promote to L1
                        const effectiveTtl = parsed.ttl || this.ramTtlMs;
                        this.lruFallback.set(key, parsed);

                        const status = age <= effectiveTtl ? 'fresh' : 'miss';
                        const finalValue = parsed.v === NEGATIVE_CACHE_MARKER ? null : parsed.v;
                        return { value: finalValue, status };
                    }
                }
            } catch (error) {
                console.error(`[CacheManager:${this.namespace}] L2 Redis get error:`, error.message);
            }
        }

        return { value: undefined, status: 'miss' };
    }

    async get(key) {
        const { value } = await this.getWithStatus(key);
        return value;
    }

    async getOrFetch(key, fetchFn, ttlMs = null) {
        const { value, status } = await this.getWithStatus(key);
        
        if (status === 'fresh') {
            return value;
        }

        if (this.activePromises.has(key)) {
            return this.activePromises.get(key);
        }

        const fetchPromise = (async () => {
            try {
                const fresh = await fetchFn();
                if (fresh !== undefined) {
                    // Un risultato VUOTO non è una verità: è quasi sempre un guasto transitorio
                    // (DuckDB non ancora caldo, fonte esterna a zero, token scaduto). Memorizzarlo
                    // col TTL normale lo congela — e siccome ogni richiesta lo riscrive, la cache
                    // resta vuota anche dopo il ritorno dei dati: è successo davvero, con 19 cataloghi
                    // vuoti in cache fino a 14 giorni. Vuoto = TTL corto, non zero: la fonte si
                    // ritenta, ma non a ogni singola richiesta.
                    const ttlDaUsare = ePayloadVuoto(fresh)
                        ? Math.min(ttlMs || this.redisTtlMs, EMPTY_PAYLOAD_TTL_MS)
                        : (ttlMs || this.redisTtlMs);
                    await this.set(key, fresh, ttlDaUsare);
                }
                return fresh;
            } catch (err) {
                console.error(`[CacheManager:${this.namespace}] fetch failed for ${key}:`, err.message);
                throw err;
            } finally {
                this.activePromises.delete(key);
            }
        })();

        this.activePromises.set(key, fetchPromise);
        return fetchPromise;
    }

    async set(key, value, ttlMs = null) {
        if (!key) return;

        const effectiveTtl = ttlMs || this.redisTtlMs;
        const storageValue = value === null ? NEGATIVE_CACHE_MARKER : value;
        const envelope = { v: storageValue, t: Date.now(), ttl: effectiveTtl };

        // 1. L1 (RAM)
        this.lruFallback.set(key, envelope);

        // 2. L2 (Redis)
        if (redisClient.isAvailable) {
            try {
                const jitter = effectiveTtl * 0.05 * (Math.random() * 2 - 1);
                const jitteredTtl = Math.max(0, effectiveTtl + jitter);
                const expireMs = Math.round(jitteredTtl);

                await redisClient.set(
                    this._getRedisKey(key),
                    JSON.stringify(envelope),
                    'PX',
                    expireMs
                );
            } catch (err) {
                console.error(`[CacheManager:${this.namespace}] Redis set error:`, err.message);
            }
        }
    }

    async delete(key) {
        this.lruFallback.delete(key);
        if (redisClient.isAvailable) {
            try {
                await redisClient.del(this._getRedisKey(key));
            } catch (error) {
                console.error(`[CacheManager:${this.namespace}] Redis delete error:`, error.message);
            }
        }
    }

    async clear() {
        this.lruFallback.clear();
        if (redisClient.isAvailable) {
            try {
                const keys = await redisClient.keys(`${this.namespace}:*`);
                if (keys.length > 0) {
                    await redisClient.del(keys);
                }
            } catch (error) {
                console.error(`[CacheManager:${this.namespace}] Redis clear error:`, error.message);
            }
        }
    }

    async getStats() {
        let l2Count;
        if (redisClient.isAvailable) {
            try {
                const keys = await redisClient.keys(`${this.namespace}:*`);
                l2Count = keys.length;
            } catch (e) {
                l2Count = 'error';
            }
        } else {
            l2Count = 'offline';
        }

        return {
            namespace: this.namespace,
            l1Count: this.lruFallback.size,
            l2Count
        };
    }

    static async getAllStats() {
        return Promise.all(CacheManager.instances.map(instance => instance.getStats()));
    }
}

module.exports = CacheManager;
