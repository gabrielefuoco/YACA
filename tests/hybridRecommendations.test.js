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
    beforeEach(() => {
        recommendationsCache.clear();
    });

    it('should store and retrieve Super-Arrays', () => {
        const testArray = [{ id: 'tt001' }, { id: 'tt002' }, { id: 'tt003' }];
        recommendationsCache.set('test_user_yaca_hybrid_movies', testArray);

        const cached = recommendationsCache.get('test_user_yaca_hybrid_movies');
        expect(cached).toEqual(testArray);
    });

    it('should return undefined for missing keys', () => {
        const cached = recommendationsCache.get('nonexistent_key');
        expect(cached).toBeUndefined();
    });

    it('should support pagination via array slicing on cached data', () => {
        const superArray = Array.from({ length: 60 }, (_, i) => ({ id: `tt${i}` }));
        recommendationsCache.set('user_catalog', superArray);

        const cached = recommendationsCache.get('user_catalog');
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
    it('should return metas array for yaca_hybrid_movies without Trakt token', async () => {
        const { catalogHandler } = require('../src/handlers/catalogHandler');
        const args = { type: 'movie', id: 'yaca_hybrid_movies', extra: { skip: 0 } };
        const userConfig = { apiKeys: { tmdb: 'fake-key' } };
        const result = await catalogHandler(args, userConfig, 'http://localhost:7000');
        expect(result).toHaveProperty('metas');
        expect(Array.isArray(result.metas)).toBe(true);
        // Without Trakt token, it should return empty
        expect(result.metas).toEqual([]);
    });

    it('should return metas array for yaca_hybrid_series without Trakt token', async () => {
        const { catalogHandler } = require('../src/handlers/catalogHandler');
        const args = { type: 'series', id: 'yaca_hybrid_series', extra: { skip: 0 } };
        const userConfig = { apiKeys: { tmdb: 'fake-key' } };
        const result = await catalogHandler(args, userConfig, 'http://localhost:7000');
        expect(result).toHaveProperty('metas');
        expect(Array.isArray(result.metas)).toBe(true);
        expect(result.metas).toEqual([]);
    });

    it('should return metas array for yaca_top_genres_mix without Trakt token', async () => {
        const { catalogHandler } = require('../src/handlers/catalogHandler');
        const args = { type: 'movie', id: 'yaca_top_genres_mix', extra: { skip: 0 } };
        const userConfig = { apiKeys: { tmdb: 'fake-key' } };
        const result = await catalogHandler(args, userConfig, 'http://localhost:7000');
        expect(result).toHaveProperty('metas');
        expect(Array.isArray(result.metas)).toBe(true);
        expect(result.metas).toEqual([]);
    });
});
