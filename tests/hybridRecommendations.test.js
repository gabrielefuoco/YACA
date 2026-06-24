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


const { calculateHybridScore, recommendationsCache } = require('../src/engines/hybridRecommendations');

describe('calculateHybridScore', () => {
    it('should give position-based score for Trakt recommendations', () => {
        const item = { tmdbId: 100, position: 1 };
        const tmdbCounts = new Map();
        const topGenres = [];
        const itemGenres = [];

        const score = calculateHybridScore(item, tmdbCounts, topGenres, itemGenres);
        // 50 - 1 = 49
        expect(score).toBe(49);
    });

    it('should give lower score for later positions', () => {
        const item = { tmdbId: 100, position: 40 };
        const tmdbCounts = new Map();
        const topGenres = [];
        const itemGenres = [];

        const score = calculateHybridScore(item, tmdbCounts, topGenres, itemGenres);
        // 50 - 40 = 10
        expect(score).toBe(10);
    });

    it('should add TMDB bonus for 1 appearance (+100)', () => {
        const item = { tmdbId: 200, position: null };
        const tmdbCounts = new Map([[200, 1]]);
        const topGenres = [];
        const itemGenres = [];

        const score = calculateHybridScore(item, tmdbCounts, topGenres, itemGenres);
        expect(score).toBe(100);
    });

    it('should add TMDB bonus for 2 appearances (+50)', () => {
        const item = { tmdbId: 200, position: null };
        const tmdbCounts = new Map([[200, 2]]);
        const topGenres = [];
        const itemGenres = [];

        const score = calculateHybridScore(item, tmdbCounts, topGenres, itemGenres);
        expect(score).toBe(50);
    });

    it('should add TMDB bonus for 3 appearances (+25)', () => {
        const item = { tmdbId: 200, position: null };
        const tmdbCounts = new Map([[200, 3]]);
        const topGenres = [];
        const itemGenres = [];

        const score = calculateHybridScore(item, tmdbCounts, topGenres, itemGenres);
        expect(score).toBe(25);
    });

    it('should add genre boost for top genre #1 (+30)', () => {
        const item = { tmdbId: 300, position: null };
        const tmdbCounts = new Map();
        const topGenres = [28, 35, 18];
        const itemGenres = [28];

        const score = calculateHybridScore(item, tmdbCounts, topGenres, itemGenres);
        expect(score).toBe(30);
    });

    it('should add genre boost for top genre #2 (+15)', () => {
        const item = { tmdbId: 300, position: null };
        const tmdbCounts = new Map();
        const topGenres = [28, 35, 18];
        const itemGenres = [35];

        const score = calculateHybridScore(item, tmdbCounts, topGenres, itemGenres);
        expect(score).toBe(15);
    });

    it('should add genre boost for top genre #3 (+5)', () => {
        const item = { tmdbId: 300, position: null };
        const tmdbCounts = new Map();
        const topGenres = [28, 35, 18];
        const itemGenres = [18];

        const score = calculateHybridScore(item, tmdbCounts, topGenres, itemGenres);
        expect(score).toBe(5);
    });

    it('should sum all three boosts when all conditions are met', () => {
        const item = { tmdbId: 400, position: 5 };
        const tmdbCounts = new Map([[400, 2]]);
        const topGenres = [28, 35, 18];
        const itemGenres = [28, 35, 18];

        const score = calculateHybridScore(item, tmdbCounts, topGenres, itemGenres);
        // Trakt: 50 - 5 = 45
        // TMDB: floor(100 / 2^1) = 50
        // Genre: 30 + 15 + 5 = 50
        expect(score).toBe(45 + 50 + 50);
    });

    it('should return 0 for item with no position, no appearances, no matching genres', () => {
        const item = { tmdbId: 500, position: null };
        const tmdbCounts = new Map();
        const topGenres = [28, 35, 18];
        const itemGenres = [99]; // Documentary, not in top 3

        const score = calculateHybridScore(item, tmdbCounts, topGenres, itemGenres);
        expect(score).toBe(0);
    });

    it('should handle fewer than 3 top genres gracefully', () => {
        const item = { tmdbId: 600, position: null };
        const tmdbCounts = new Map();
        const topGenres = [28]; // only 1 genre
        const itemGenres = [28];

        const score = calculateHybridScore(item, tmdbCounts, topGenres, itemGenres);
        expect(score).toBe(30);
    });

    it('should handle empty topGenres gracefully', () => {
        const item = { tmdbId: 700, position: null };
        const tmdbCounts = new Map();
        const topGenres = [];
        const itemGenres = [28, 35];

        const score = calculateHybridScore(item, tmdbCounts, topGenres, itemGenres);
        expect(score).toBe(0);
    });
});

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
    it('should be 4 hours (14400000 ms)', () => {
        const config = require('../src/config');
        expect(config.RECOMMENDATIONS_CACHE_TTL_MS).toBe(4 * 60 * 60 * 1000);
    });
});

describe('hybridRecommendations module exports', () => {
    it('should export all required functions', () => {
        const engine = require('../src/engines/hybridRecommendations');
        expect(typeof engine.getHybridCatalog).toBe('function');
        expect(typeof engine.buildHybridCatalog).toBe('function');
        expect(typeof engine.buildTopGenresMixCatalog).toBe('function');
        expect(typeof engine.calculateHybridScore).toBe('function');
        expect(typeof engine.fetchRecentHistory).toBe('function');
        expect(typeof engine.fetchTraktRecommendationsRaw).toBe('function');
        expect(typeof engine.fetchTmdbSimilarCounts).toBe('function');
        expect(typeof engine.computeTopGenres).toBe('function');
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

    it('should route active phase4 id yaca_true_blend_movies to hybrid engine', async () => {
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
            { type: 'movie', id: 'yaca_true_blend_movies', extra: { skip: 0 }, filters: null },
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
