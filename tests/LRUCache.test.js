const LRUCache = require('../src/utils/LRUCache');

describe('LRUCache', () => {
    it('should store and retrieve values', () => {
        const cache = new LRUCache({ max: 10 });
        cache.set('key1', 'value1');
        expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
        const cache = new LRUCache({ max: 10 });
        expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should evict oldest entries when max size is reached', () => {
        const cache = new LRUCache({ max: 3 });
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        cache.set('d', 4); // Should evict 'a'

        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe(2);
        expect(cache.get('d')).toBe(4);
        expect(cache.size).toBe(3);
    });

    it('should refresh position on get (LRU behavior)', () => {
        const cache = new LRUCache({ max: 3 });
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        // Access 'a' to move it to most-recently-used
        cache.get('a');

        // Insert 'd' which should evict 'b' (now oldest)
        cache.set('d', 4);

        expect(cache.get('a')).toBe(1);  // Still present (was refreshed)
        expect(cache.get('b')).toBeUndefined(); // Evicted
        expect(cache.get('c')).toBe(3);
        expect(cache.get('d')).toBe(4);
    });

    it('should expire entries based on TTL', async () => {
        const cache = new LRUCache({ max: 10, ttl: 50 }); // 50ms TTL
        cache.set('key1', 'value1');

        expect(cache.get('key1')).toBe('value1');

        // Wait for TTL to expire
        await new Promise(resolve => setTimeout(resolve, 60));

        expect(cache.get('key1')).toBeUndefined();
        expect(cache.has('key1')).toBe(false);
    });

    it('should report correct has() status', () => {
        const cache = new LRUCache({ max: 10 });
        cache.set('exists', true);

        expect(cache.has('exists')).toBe(true);
        expect(cache.has('missing')).toBe(false);
    });

    it('should update value on re-set', () => {
        const cache = new LRUCache({ max: 10 });
        cache.set('key1', 'old');
        cache.set('key1', 'new');

        expect(cache.get('key1')).toBe('new');
        expect(cache.size).toBe(1);
    });

    it('should clear all entries', () => {
        const cache = new LRUCache({ max: 10 });
        cache.set('a', 1);
        cache.set('b', 2);
        cache.clear();

        expect(cache.size).toBe(0);
        expect(cache.get('a')).toBeUndefined();
    });
});
