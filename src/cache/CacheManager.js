const LRUCache = require('../utils/LRUCache');
const redisClient = require('./redisClient');

const NEGATIVE_CACHE_MARKER = '__NULL__';

class CacheManager {
    static instances = [];

    /**
     * @param {string} namespace
     * @param {object} opts
     * @param {number} opts.ramMax      - Max items in L1 cache
     * @param {number} opts.ramTtlMs    - L1 TTL in ms
     * @param {number} opts.redisTtlMs  - L2 TTL in ms (Redis expiration)
     * @param {number} opts.swrMs       - Stale-While-Revalidate window in ms
     * 
     * Note: "mongoTtlMs" parameter is supported for backwards compatibility.
     */
    constructor(namespace, { ramMax = 1000, ramTtlMs = 300000, redisTtlMs, mongoTtlMs, swrMs = 0 } = {}) {
        this.namespace = namespace;
        this.ramTtlMs = ramTtlMs;
        this.redisTtlMs = redisTtlMs || mongoTtlMs || 86400000;
        this.swrMs = swrMs;

        // L1: Fast in-memory buffer to absorb burst requests
        this.lruFallback = new LRUCache({ max: ramMax, ttl: ramTtlMs + swrMs });
        
        // Prevents thundering herd on cache miss
        this.activePromises = new Map();
        
        CacheManager.instances.push(this);
    }

    _getRedisKey(key) {
        return `${this.namespace}:${key}`;
    }

    // ─── L1 helpers (Pure In-Memory LRU) ───

    async _l1Get(key) {
        return this.lruFallback.get(key);
    }

    async _l1Set(key, envelope, ttlMs) {
        this.lruFallback.set(key, envelope);
    }

    async _l1Delete(key) {
        this.lruFallback.delete(key);
    }

    async _l1Clear() {
        this.lruFallback.clear();
    }

    async _l1Size() {
        return this.lruFallback.size;
    }

    // ─── Public API ───

    async getWithStatus(key) {
        // 1. Check L1
        const envelope = await this._l1Get(key);
        if (envelope !== undefined && envelope !== null) {
            if (typeof envelope === 'object' && 't' in envelope && 'v' in envelope) {
                const age = Date.now() - envelope.t;
                if (age <= this.ramTtlMs) {
                    return { value: envelope.v === NEGATIVE_CACHE_MARKER ? null : envelope.v, status: 'fresh' };
                }
                if (this.swrMs > 0 && age <= this.ramTtlMs + this.swrMs) {
                    return { value: envelope.v === NEGATIVE_CACHE_MARKER ? null : envelope.v, status: 'stale' };
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
                        const l1Ttl = this.ramTtlMs + this.swrMs;
                        await this._l1Set(key, parsed, l1Ttl);

                        const status = age <= this.ramTtlMs ? 'fresh' : (this.swrMs > 0 && age <= this.ramTtlMs + this.swrMs ? 'stale' : 'miss');
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

    async getOrFetch(key, fetchFn, ttlMs = null, options = {}) {
        const { value, status } = await this.getWithStatus(key);
        
        if (status === 'fresh') {
            return value;
        }

        if (this.activePromises.has(key)) {
            if (status === 'stale') return value;
            return this.activePromises.get(key);
        }

        const fetchPromise = (async () => {
            try {
                const fresh = await fetchFn();
                if (fresh !== undefined) {
                    await this.set(key, fresh, ttlMs || this.redisTtlMs, options);
                }
                return fresh;
            } catch (err) {
                console.error(`[CacheManager:${this.namespace}] SWR revalidation failed for ${key}:`, err.message);
                throw err;
            } finally {
                this.activePromises.delete(key);
            }
        })();

        this.activePromises.set(key, fetchPromise);

        if (status === 'stale') return value;
        return fetchPromise;
    }

    async set(key, value, ttlMs = null, options = { useRam: true }) {
        if (!key) return;

        const effectiveTtl = ttlMs || this.redisTtlMs;
        const useRam = options.useRam !== false;
        const storageValue = value === null ? NEGATIVE_CACHE_MARKER : value;
        const envelope = { v: storageValue, t: Date.now() };

        // 1. L1 (RAM)
        if (useRam) {
            const l1Ttl = this.ramTtlMs + this.swrMs;
            await this._l1Set(key, envelope, l1Ttl);
        }

        // 2. L2 (Redis)
        if (redisClient.isAvailable) {
            try {
                const jitter = effectiveTtl * 0.05 * (Math.random() * 2 - 1);
                const jitteredTtl = Math.max(0, effectiveTtl + jitter);
                const expireMs = Math.round(jitteredTtl + this.swrMs); // Keep alive during SWR

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
        await this._l1Delete(key);
        if (redisClient.isAvailable) {
            try {
                await redisClient.del(this._getRedisKey(key));
            } catch (error) {
                console.error(`[CacheManager:${this.namespace}] Redis delete error:`, error.message);
            }
        }
    }

    async clear() {
        await this._l1Clear();
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
        let l2Count = 0;
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
            l1Count: await this._l1Size(),
            l2Count
        };
    }

    static async getAllStats() {
        return Promise.all(CacheManager.instances.map(instance => instance.getStats()));
    }
}

function getCacheConfig(requestedTtl) {
    const { 
        FAST_CATALOG_PAGE1_L2_TTL_MS, 
        SLOW_CATALOG_L2_TTL_MS, 
        CACHE_TTL_MS 
    } = require('../config');

    if (requestedTtl === 'fast') {
        return {
            ttl: FAST_CATALOG_PAGE1_L2_TTL_MS,
            cacheOptions: { catalogTier: 'fast' }
        };
    }
    if (requestedTtl === 'slow') {
        return {
            ttl: SLOW_CATALOG_L2_TTL_MS,
            cacheOptions: { catalogTier: 'slow' }
        };
    }
    const ttl = typeof requestedTtl === 'number' ? requestedTtl : CACHE_TTL_MS;
    return {
        ttl,
        cacheOptions: { cacheTtlMs: ttl }
    };
}

CacheManager.getCacheConfig = getCacheConfig;
module.exports = CacheManager;
