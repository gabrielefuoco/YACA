const CacheManager = require('../src/cache/CacheManager');

describe('TmdbRequestCache', () => {
    it('should be a CacheManager instance', () => {
        const { TmdbRequestCache } = require('../src/cache/cacheInstances');
        expect(TmdbRequestCache).toBeInstanceOf(CacheManager);
    });

    it('should use the tmdb_catalog namespace', () => {
        const { TmdbRequestCache } = require('../src/cache/cacheInstances');
        expect(TmdbRequestCache.namespace).toBe('tmdb_catalog_raw');
    });

    it('should expose standard CacheManager methods', () => {
        const { TmdbRequestCache } = require('../src/cache/cacheInstances');
        expect(typeof TmdbRequestCache.get).toBe('function');
        expect(typeof TmdbRequestCache.getWithStatus).toBe('function');
        expect(typeof TmdbRequestCache.set).toBe('function');
        expect(typeof TmdbRequestCache.clear).toBe('function');
        expect(typeof TmdbRequestCache.delete).toBe('function');
    });

    it('should have swrMs configured', () => {
        const { TmdbRequestCache } = require('../src/cache/cacheInstances');
        expect(TmdbRequestCache.swrMs).toBeGreaterThan(0);
    });
});
