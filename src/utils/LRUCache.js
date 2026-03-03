/**
 * A simple size-limited cache with TTL support.
 * Evicts the oldest entries when the maximum size is reached.
 */
class LRUCache {
    constructor({ max = 1000, ttl = 0 } = {}) {
        this.max = max;
        this.ttl = ttl; // TTL in milliseconds, 0 = no expiry
        this.cache = new Map();
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return undefined;

        if (this.ttl > 0 && Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return undefined;
        }

        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value;
    }

    set(key, value) {
        // Delete first to refresh position
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Evict oldest if at capacity
        if (this.cache.size >= this.max) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, { value, timestamp: Date.now() });
    }

    has(key) {
        const entry = this.cache.get(key);
        if (!entry) return false;

        if (this.ttl > 0 && Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    delete(key) {
        this.cache.delete(key);
    }

    get size() {
        return this.cache.size;
    }

    clear() {
        this.cache.clear();
    }
}

module.exports = LRUCache;
