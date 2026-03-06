const LRUCache = require('../utils/LRUCache');
const CacheEntry = require('../db/models/CacheEntry');

class CacheManager {
    static instances = [];

    constructor(namespace, { ramMax = 50, ramTtlMs = 300000, mongoTtlMs = 86400000 } = {}) {
        this.namespace = namespace;
        this.mongoTtlMs = mongoTtlMs;

        // L1 Cache: In-memory RAM (LRU)
        this.l1 = new LRUCache({ max: ramMax, ttl: ramTtlMs });
        CacheManager.instances.push(this);
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
     * Salva un valore sia in L1 (RAM) che in L2 (MongoDB)
     * @param {string} key 
     * @param {any} value 
     * @param {number} ttlMs - (Opzionale) TTL specifico in ms
     * @param {object} options - (Opzionale) { useRam: boolean }
     */
    async set(key, value, ttlMs = null, options = { useRam: true }) {
        if (!key) return;

        const effectiveTtl = ttlMs || this.mongoTtlMs;
        const useRam = options.useRam !== false;

        // 1. L1 (RAM) - Opzionale per risparmio memoria (es. pre-warming)
        if (useRam) {
            this.l1.set(key, value, ttlMs || this.ramTtlMs);
        }

        // 2. L2 (MongoDB)
        try {
            await mongoose.model('CacheEntry').findOneAndUpdate(
                { key, namespace: this.namespace },
                {
                    value,
                    expiresAt: new Date(Date.now() + effectiveTtl)
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error(`[CacheManager:${this.namespace}] Errore set MongoDB:`, err.message);
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

    /**
     * Recupera le statistiche di utilizzo per questo namespace
     */
    async getStats() {
        try {
            const l1Count = this.l1.size;
            const l2Count = await CacheEntry.countDocuments({ namespace: this.namespace });
            return {
                namespace: this.namespace,
                l1Count,
                l2Count
            };
        } catch (e) {
            return { namespace: this.namespace, l1Count: this.l1.size, l2Count: 'error' };
        }
    }

    /**
     * Recupera le statistiche di tutte le istanze CacheManager attive.
     */
    static async getAllStats() {
        return Promise.all(CacheManager.instances.map(instance => instance.getStats()));
    }
}

module.exports = CacheManager;
