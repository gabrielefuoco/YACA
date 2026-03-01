// Mock config to provide CACHE_TTL_MS
jest.mock('../src/config', () => ({
    CACHE_TTL_MS: 24 * 60 * 60 * 1000
}));

let TmdbRequestCache;

describe('TmdbRequestCache', () => {
    beforeEach(() => {
        jest.resetModules();
        TmdbRequestCache = require('../src/models/TmdbRequestCache');
    });

    describe('get', () => {
        it('should return null on cache miss', () => {
            const result = TmdbRequestCache.get('missinghash');
            expect(result).toBeNull();
        });

        it('should return fresh data when within TTL', () => {
            TmdbRequestCache.set('freshhash', '/discover/movie', [{ id: 'tt123', name: 'Test Movie' }]);

            const result = TmdbRequestCache.get('freshhash');
            expect(result).not.toBeNull();
            expect(result.isStale).toBe(false);
            expect(result.stremioData).toEqual([{ id: 'tt123', name: 'Test Movie' }]);
        });

        it('should return stale data when TTL has expired', () => {
            TmdbRequestCache.set('stalehash', '/discover/movie', [{ id: 'tt456', name: 'Old Movie' }]);

            // Advance time by 25 hours to exceed the 24h default TTL
            jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);

            const result = TmdbRequestCache.get('stalehash');
            expect(result).not.toBeNull();
            expect(result.isStale).toBe(true);
            expect(result.stremioData).toEqual([{ id: 'tt456', name: 'Old Movie' }]);

            Date.now.mockRestore();
        });

        it('should respect custom TTL when provided', () => {
            TmdbRequestCache.set('customttlhash', '/discover/movie', [{ id: 'tt999', name: 'Fast TTL Movie' }]);

            // Advance time by 45 minutes
            jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 45 * 60 * 1000);

            const result = TmdbRequestCache.get('customttlhash', 30 * 60 * 1000);
            expect(result).not.toBeNull();
            expect(result.isStale).toBe(true);

            Date.now.mockRestore();
        });
    });

    describe('set', () => {
        it('should store data and retrieve it', () => {
            TmdbRequestCache.set('testhash', '/discover/movie', [{ id: 'tt789' }]);

            const result = TmdbRequestCache.get('testhash');
            expect(result).not.toBeNull();
            expect(result.stremioData).toEqual([{ id: 'tt789' }]);
            expect(result.isStale).toBe(false);
        });

        it('should overwrite existing entry', () => {
            TmdbRequestCache.set('hash', '/discover/movie', [{ id: 'old' }]);
            TmdbRequestCache.set('hash', '/discover/movie', [{ id: 'new' }]);

            const result = TmdbRequestCache.get('hash');
            expect(result.stremioData).toEqual([{ id: 'new' }]);
        });
    });

    describe('clear', () => {
        it('should clear all entries and return { deleted: true }', () => {
            TmdbRequestCache.set('a', '/endpoint', [1]);
            TmdbRequestCache.set('b', '/endpoint', [2]);

            const result = TmdbRequestCache.clear();
            expect(result).toEqual({ deleted: true });
            expect(TmdbRequestCache.get('a')).toBeNull();
            expect(TmdbRequestCache.get('b')).toBeNull();
        });
    });
});
