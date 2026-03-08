describe('Cache sizing configuration', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('uses 1000 items as default RAM fallback size in CacheManager', () => {
        const CacheManager = require('../src/cache/CacheManager');
        const cache = new CacheManager('default_size_namespace');

        expect(cache.lruFallback.max).toBe(1000);
    });

    it('configures final_meta_cache with 2000 RAM entries', () => {
        jest.doMock('../src/cache/CacheManager', () => {
            return jest.fn().mockImplementation(() => ({
                get: jest.fn(),
                set: jest.fn()
            }));
        });
        jest.doMock('../src/clients/tmdb', () => ({
            getTmdbMetaDetails: jest.fn()
        }));
        jest.doMock('../src/clients/kitsu', () => ({
            getKitsuMetaDetails: jest.fn(),
            getKitsuIdFromTmdbId: jest.fn(),
            fetchKitsuEpisodes: jest.fn()
        }));
        jest.doMock('../src/id_mapping/id_cache', () => ({
            translateImdbToTmdb: jest.fn()
        }));
        jest.doMock('../src/utils/mdblist', () => ({
            fetchMdblistRatings: jest.fn()
        }));

        require('../src/handlers/metaHandler');
        const CacheManagerMock = require('../src/cache/CacheManager');

        expect(CacheManagerMock).toHaveBeenCalledWith(
            'final_meta_cache',
            expect.objectContaining({ ramMax: 2000, ramTtlMs: 3600000 })
        );
    });
});
