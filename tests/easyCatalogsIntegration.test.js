const CacheManager = require('../src/cache/CacheManager');
const { rateLimitedMap } = require('../src/utils/rateLimiter');
const CacheEntry = require('../src/models/CacheEntry');
const mongoose = require('mongoose');

// Mock CacheEntry for jitter testing
jest.mock('../src/models/CacheEntry');

describe('Easy Catalogs Integration - New Features', () => {
    
    describe('CacheManager Jitter & Negative Caching', () => {
        let cache;

        beforeEach(() => {
            cache = new CacheManager('test_jitter', { ramTtlMs: 1000, mongoTtlMs: 5000 });
            jest.clearAllMocks();
        });

        it('should apply jitter to MongoDB expiresAt', async () => {
            const key = 'test-jitter-key';
            const value = 'test-value';
            const ttl = 10000;
            
            CacheEntry.findOneAndUpdate.mockResolvedValue({});

            await cache.set(key, value, ttl);

            expect(CacheEntry.findOneAndUpdate).toHaveBeenCalled();
            const updateCall = CacheEntry.findOneAndUpdate.mock.calls[0][1];
            const expiresAt = updateCall.expiresAt;
            const now = Date.now();
            
            // Difference should be around 10000ms +/- 500ms (5%)
            const diff = expiresAt.getTime() - now;
            expect(diff).toBeGreaterThan(9500 - 100); // Small margin for exec time
            expect(diff).toBeLessThan(10500 + 100);
        });

        it('should handle negative caching for null values', async () => {
            const key = 'test-negative-key';
            
            // Mock getWithStatus to return miss initially
            // Then manually check how it stores/retrieves null
            
            // We need a real LRU to test the cycle
            await cache.set(key, null);
            
            const result = await cache.getWithStatus(key);
            expect(result.value).toBe(null);
            expect(result.status).toBe('fresh');

            // Verify it was stored as marker in mock
            const updateCall = CacheEntry.findOneAndUpdate.mock.calls[0][1];
            expect(updateCall.value).toBe('__NULL__');
        });
    });

    describe('RateLimiter Worker Pool', () => {
        it('should process items concurrently up to limit', async () => {
            const items = [1, 2, 3, 4, 5];
            let activeCount = 0;
            let maxActive = 0;

            const fn = async (item) => {
                activeCount++;
                maxActive = Math.max(maxActive, activeCount);
                await new Promise(resolve => setTimeout(resolve, 50));
                activeCount--;
                return item * 2;
            };

            const results = await rateLimitedMap(items, fn, { batchSize: 2, delayMs: 0 });
            
            expect(results).toEqual([2, 4, 6, 8, 10]);
            expect(maxActive).toBe(2);
        });

        it('should handle individual errors in pool without failing the entire batch', async () => {
            const items = [1, 2, 3];
            const fn = async (item) => {
                if (item === 2) throw new Error('fail');
                return item;
            };

            const results = await rateLimitedMap(items, fn, { batchSize: 3, delayMs: 0 });
            expect(results).toEqual([1, null, 3]);
        });
    });
});
