const LRUCache = require('../utils/LRUCache');
const CacheEntry = require('../db/models/CacheEntry');

class CacheManager {
    constructor(namespace, { ramMax = 500, ramTtlMs = 300000, mongoTtlMs = 86400000 } = {}) {
        this.namespace = namespace;
        this.mongoTtlMs = mongoTtlMs;

        // L1 Cache: In-memory RAM (LRU)
        this.l1 = new LRUCache({ max: ramMax, ttl: ramTtlMs });
    }

    /**
     * Recupera un valore dalla cache (L1 poi L2).
     */
    async get(key) {
        // 1. Check L1 RAM
        const cachedL1 = this.l1.get(key);
        if (cachedL1 !== undefined) {
            return cachedL1;
        }

        // 2. Check L2 MongoDB
        try {
            const entry = await CacheEntry.findOne({
                namespace: this.namespace,
                key: key,
                expiresAt: { $gt: new Date() }
            });

            if (entry) {
                // Promuovi in L1
                this.l1.set(key, entry.value);
                return entry.value;
            }
        } catch (error) {
            console.error(`[CacheManager:${this.namespace}] L2 get error:`, error.message);
        }

        return undefined;
    }

    /**
     * Salva un valore in cache (sia L1 che L2).
     */
    async set(key, value, customTtlMs = null) {
        const ttl = customTtlMs || this.mongoTtlMs;
        const expiresAt = new Date(Date.now() + ttl);

        // 1. Salva in L1
        this.l1.set(key, value);

        // 2. Salva in L2 MongoDB (Upsert)
        try {
            await CacheEntry.findOneAndUpdate(
                { namespace: this.namespace, key: key },
                { value: value, expiresAt: expiresAt },
                { upsert: true, new: true }
            );
        } catch (error) {
            console.error(`[CacheManager:${this.namespace}] L2 set error:`, error.message);
        }
    }

    /**
     * Rimuove un elemento da entrambi i livelli.
     */
    async delete(key) {
        this.l1.delete(key);
        try {
            await CacheEntry.deleteOne({ namespace: this.namespace, key: key });
        } catch (error) {
            console.error(`[CacheManager:${this.namespace}] L2 delete error:`, error.message);
        }
    }

    /**
     * Pulisce l'intero namespace.
     */
    async clear() {
        this.l1.clear();
        try {
            await CacheEntry.deleteMany({ namespace: this.namespace });
        } catch (error) {
            console.error(`[CacheManager:${this.namespace}] L2 clear error:`, error.message);
        }
    }
}

module.exports = CacheManager;
