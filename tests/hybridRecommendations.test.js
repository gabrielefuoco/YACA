const mockRecommendationStore = new Map();

jest.mock('../src/cache/cacheInstances', () => ({
    hybridRecommendationsCache: {
        clear: jest.fn(async () => mockRecommendationStore.clear()),
        set: jest.fn(async (key, value) => mockRecommendationStore.set(key, value)),
        get: jest.fn(async (key) => mockRecommendationStore.get(key)),
        getWithStatus: jest.fn(async (key) => {
            const value = mockRecommendationStore.get(key);
            return value === undefined ? { value: null, status: 'miss' } : { value, status: 'fresh' };
        }),
        delete: jest.fn(async (key) => mockRecommendationStore.delete(key))
    }
}));

jest.mock('../src/clients/trakt', () => ({
    traktClient: {
        get: jest.fn()
    }
}));



const { hybridRecommendationsCache: recommendationsCache } = require('../src/cache/cacheInstances');


describe('recommendationsCache', () => {
    beforeEach(async () => {
        await recommendationsCache.clear();
    });

    it('should store and retrieve Super-Arrays', async () => {
        const testArray = [{ id: 'tt001' }, { id: 'tt002' }, { id: 'tt003' }];
        await recommendationsCache.set('test_user_yaca_hybrid_movies', testArray);

        const cached = await recommendationsCache.get('test_user_yaca_hybrid_movies');
        expect(cached).toEqual(testArray);
    });

    it('should return undefined for missing keys', async () => {
        const cached = await recommendationsCache.get('nonexistent_key');
        expect(cached).toBeUndefined();
    });

    it('should support pagination via array slicing on cached data', async () => {
        const superArray = Array.from({ length: 60 }, (_, i) => ({ id: `tt${i}` }));
        await recommendationsCache.set('user_catalog', superArray);

        const cached = await recommendationsCache.get('user_catalog');
        const page1 = cached.slice(0, 20);
        const page2 = cached.slice(20, 40);
        const page3 = cached.slice(40, 60);

        expect(page1.length).toBe(20);
        expect(page2.length).toBe(20);
        expect(page3.length).toBe(20);
        expect(page1[0].id).toBe('tt0');
        expect(page2[0].id).toBe('tt20');
        expect(page3[0].id).toBe('tt40');
    });
});

describe('config RECOMMENDATIONS_CACHE_TTL_MS', () => {
    it('should be 7 days (604800000 ms)', () => {
        const config = require('../src/config');
        expect(config.RECOMMENDATIONS_CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });
});

describe('composer module exports', () => {
    it('should export all required functions', () => {
        const composer = require('../src/pool/composer');
        expect(typeof composer.getHybridCatalog).toBe('function');
        expect(typeof composer.fetchPopularFallbackIds).toBe('function');
        expect(typeof composer.buildDirectPresetCatalog).toBe('function');
    });
});

describe('catalogHandler handles hybrid catalog IDs', () => {
    it('should return empty metas for removed legacy id yaca_hybrid_movies', async () => {
        const { routeCatalogRequest } = require('../src/catalog/CatalogRouter');
        const result = await routeCatalogRequest(
            { type: 'movie', id: 'yaca_hybrid_movies', extra: { skip: 0 }, filters: null },
            { userId: 'u1', apiKeys: { tmdb: 'fake-key' }, profiles: [], activeProfileId: 'global' },
            {},
            'fake-key',
            {},
            {},
            null
        );
        expect(result).toEqual([]);
    });

    it('should return empty metas for removed legacy id yaca_hybrid_series', async () => {
        const { routeCatalogRequest } = require('../src/catalog/CatalogRouter');
        const result = await routeCatalogRequest(
            { type: 'series', id: 'yaca_hybrid_series', extra: { skip: 0 }, filters: null },
            { userId: 'u1', apiKeys: { tmdb: 'fake-key' }, profiles: [], activeProfileId: 'global' },
            {},
            'fake-key',
            {},
            {},
            null
        );
        expect(result).toEqual([]);
    });

    it('should return empty metas for removed legacy id yaca_top20_movies', async () => {
        const { routeCatalogRequest } = require('../src/catalog/CatalogRouter');
        const result = await routeCatalogRequest(
            { type: 'movie', id: 'yaca_top20_movies', extra: { skip: 0 }, filters: null },
            { userId: 'u1', apiKeys: { tmdb: 'fake-key' }, profiles: [], activeProfileId: 'global' },
            {},
            'fake-key',
            {},
            {},
            null
        );
        expect(result).toEqual([]);
    });

    it('should route active hero id yaca_mondi_movies to hybrid engine', async () => {
        let routeCatalogRequestFromIsolatedModule;
        jest.isolateModules(() => {
            jest.doMock('../src/catalog/providers/HybridProvider', () => {
                const original = jest.requireActual('../src/catalog/providers/HybridProvider');
                return {
                    ...original,
                    getEngineHybridCatalog: jest.fn(async () => [{ id: 'tmdb:999', type: 'movie', name: 'Phase4' }])
                };
            });
            ({ routeCatalogRequest: routeCatalogRequestFromIsolatedModule } = require('../src/catalog/CatalogRouter'));
        });
        const result = await routeCatalogRequestFromIsolatedModule(
            { type: 'movie', id: 'yaca_mondi_movies', extra: { skip: 0 }, filters: null },
            { userId: 'u1', apiKeys: { tmdb: 'fake-key' }, profiles: [], activeProfileId: 'global' },
            {},
            'fake-key',
            {},
            {},
            null
        );
        expect(result).toEqual([{ id: 'tmdb:999', type: 'movie', name: 'Phase4' }]);
    });
});
