const LRUCache = require('../utils/LRUCache');
const CacheEntry = require('../models/CacheEntry');

const NEGATIVE_CACHE_MARKER = '__NULL__';

class CacheManager {
    static instances = [];

    /**
     * @param {string} namespace
     * @param {object} opts
     * @param {number} opts.ramMax      - Max items in LRU cache
     * @param {number} opts.ramTtlMs    - L1 TTL in ms
     * @param {number} opts.mongoTtlMs  - L2 TTL in ms (MongoDB expiration)
     * @param {number} opts.swrMs       - Stale-While-Revalidate window in ms (0 = disabled)
     */
    constructor(namespace, { ramMax = 1000, ramTtlMs = 300000, mongoTtlMs = 86400000, swrMs = 0 } = {}) {
        this.namespace = namespace;
        this.ramTtlMs = ramTtlMs;
        this.mongoTtlMs = mongoTtlMs;
        this.swrMs = swrMs;

        // LRU in-memory cache as L1
        this.lruFallback = new LRUCache({ max: ramMax, ttl: ramTtlMs + swrMs });
        CacheManager.instances.push(this);
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

    /**
     * Retrieves a value from cache (L1 → L2).
     * Returns { value, status } where status is 'fresh' | 'stale' | 'miss'.
     * For backward compat, bare `get()` returns the raw value (fresh or stale).
     */
    async getWithStatus(key) {
        // 1. Check L1 (Redis / LRU)
        const envelope = await this._l1Get(key);
        if (envelope !== undefined && envelope !== null) {
            // Envelope format: { v: <value>, t: <storedAtMs> }
            if (envelope && typeof envelope === 'object' && 't' in envelope && 'v' in envelope) {
                const age = Date.now() - envelope.t;
                if (age <= this.ramTtlMs) {
                    const finalValue = envelope.v === NEGATIVE_CACHE_MARKER ? null : envelope.v;
                    return { value: finalValue, status: 'fresh' };
                }
                if (this.swrMs > 0 && age <= this.ramTtlMs + this.swrMs) {
                    const finalValue = envelope.v === NEGATIVE_CACHE_MARKER ? null : envelope.v;
                    return { value: finalValue, status: 'stale' };
                }
                // Beyond SWR window — treat as miss, but we can still use L2
            } else {
                // Legacy format (plain value without envelope) — treat as fresh
                const finalValue = envelope === NEGATIVE_CACHE_MARKER ? null : envelope;
                return { value: finalValue, status: 'fresh' };
            }
        }

        // 2. Check L2 (MongoDB)
        try {
            const entry = await CacheEntry.findOne({
                namespace: this.namespace,
                key: key,
                expiresAt: { $gt: new Date() }
            });

            if (entry) {
                // Promote to L1 preserving the original storage timestamp
                const originalTimestamp = entry.updatedAt ? new Date(entry.updatedAt).getTime() : Date.now();
                const freshEnvelope = { v: entry.value, t: originalTimestamp };
                const l1Ttl = this.ramTtlMs + this.swrMs;
                await this._l1Set(key, freshEnvelope, l1Ttl);
                const age = Date.now() - originalTimestamp;
                const status = age <= this.ramTtlMs ? 'fresh' : (this.swrMs > 0 && age <= this.ramTtlMs + this.swrMs ? 'stale' : 'miss');
                
                // Handle negative cache marker
                const finalValue = entry.value === NEGATIVE_CACHE_MARKER ? null : entry.value;
                return { value: finalValue, status };
            }
        } catch (error) {
            console.error(`[CacheManager:${this.namespace}] L2 get error:`, error.message);
        }

        return { value: undefined, status: 'miss' };
    }

    /**
     * Backward-compatible get: returns value or undefined.
     * Stale data is still returned (SWR consumer should use getWithStatus for revalidation).
     */
    async get(key) {
        const { value } = await this.getWithStatus(key);
        return value;
    }

    /**
     * Managed SWR: get from cache, or fetch and cache.
     * If data is stale, returns stale data AND triggers fetchFn in background.
     * If miss, waits for fetchFn and returns result.
     */
    async getOrFetch(key, fetchFn, ttlMs = null, options = {}) {
        const { value, status } = await this.getWithStatus(key);
        
        if (status === 'fresh') {
            return value;
        }

        if (status === 'stale') {
            const revalidateTtl = ttlMs || this.mongoTtlMs;
            // Background revalidation
            setImmediate(async () => {
                try {
                    const fresh = await fetchFn();
                    if (fresh !== undefined) {
                        await this.set(key, fresh, revalidateTtl, options);
                    }
                } catch (err) {
                    console.error(`[CacheManager:${this.namespace}] SWR revalidation failed for ${key}:`, err.message);
                }
            });
            return value;
        }

        // Miss: fetch and wait
        const fresh = await fetchFn();
        if (fresh !== undefined) {
            await this.set(key, fresh, ttlMs || this.mongoTtlMs, options);
        }
        return fresh;
    }

    /**
     * Saves a value to both L1 (Redis) and L2 (MongoDB).
     * @param {string} key
     * @param {any} value
     * @param {number} ttlMs - Optional override for L2 TTL
     * @param {object} options - { useRam: boolean }
     */
    async set(key, value, ttlMs = null, options = { useRam: true }) {
        if (!key) return;

        const effectiveTtl = ttlMs || this.mongoTtlMs;
        const useRam = options.useRam !== false;

        // Use marker for null values to distinguish from cache miss
        const storageValue = value === null ? NEGATIVE_CACHE_MARKER : value;

        // 1. L1 (Redis / LRU)
        if (useRam) {
            const envelope = { v: storageValue, t: Date.now() };
            const l1Ttl = this.ramTtlMs + this.swrMs;
            await this._l1Set(key, envelope, l1Ttl);
        }

        // 2. L2 (MongoDB)
        try {
            // Apply TTL jitter (+/- 5%) to mitigate thundering herd
            const jitter = effectiveTtl * 0.05 * (Math.random() * 2 - 1);
            const jitteredTtl = Math.max(0, effectiveTtl + jitter);

            await CacheEntry.findOneAndUpdate(
                { key, namespace: this.namespace },
                {
                    value: storageValue,
                    expiresAt: new Date(Date.now() + jitteredTtl)
                },
                { upsert: true, returnDocument: 'after' }
            );
        } catch (err) {
            console.error(`[CacheManager:${this.namespace}] Errore set MongoDB:`, err.message);
        }
    }

    /**
     * Remove from both L1 and L2.
     */
    async delete(key) {
        await this._l1Delete(key);
        try {
            await CacheEntry.deleteOne({ namespace: this.namespace, key: key });
        } catch (error) {
            console.error(`[CacheManager:${this.namespace}] L2 delete error:`, error.message);
        }
    }

    /**
     * Clear entire namespace from L1 and L2.
     */
    async clear() {
        await this._l1Clear();
        try {
            await CacheEntry.deleteMany({ namespace: this.namespace });
        } catch (error) {
            console.error(`[CacheManager:${this.namespace}] L2 clear error:`, error.message);
        }
    }

    /**
     * Usage statistics for this namespace.
     */
    async getStats() {
        try {
            const l1Count = await this._l1Size();
            const l2Count = await CacheEntry.countDocuments({ namespace: this.namespace });
            return {
                namespace: this.namespace,
                l1Count,
                l2Count
            };
        } catch (e) {
            return { namespace: this.namespace, l1Count: this.lruFallback.size, l2Count: 'error' };
        }
    }

    /**
     * Aggregate stats across all active CacheManager instances.
     */
    static async getAllStats() {
        return Promise.all(CacheManager.instances.map(instance => instance.getStats()));
    }
}

/**
 * Determines the appropriate TTL and fetch options for a catalog request
 * based on the requested TTL tier or numeric value.
 */
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
