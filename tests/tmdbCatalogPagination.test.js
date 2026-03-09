jest.mock('../src/models/TmdbRequestCache', () => ({
    get: jest.fn(),
    getWithStatus: jest.fn(),
    set: jest.fn().mockResolvedValue()
}));

jest.mock('../src/utils/requestHash', () => ({
    generateRequestHash: jest.fn(() => 'shared-hash')
}));

jest.mock('../src/utils/rateLimiter', () => ({
    rateLimitedMap: jest.fn(async (items, fn) => {
        const results = [];
        for (const item of items) {
            const result = await fn(item);
            results.push(result);
        }
        return results;
    }),
    rateLimitedMapFiltered: jest.fn(async (items, fn) => {
        const results = [];
        for (const item of items) {
            const result = await fn(item);
            if (result != null) results.push(result);
        }
        return results;
    })
}));

jest.mock('../src/utils/releaseFilter', () => ({
    isMovieReleasedDigitally: jest.fn(),
    isMovieReleasedInRegion: jest.fn()
}));

jest.mock('../src/utils/httpClient', () => ({
    createAxiosInstance: jest.fn(() => ({
        get: jest.fn(async (url) => {
            const match = /\/(?:movie|tv)\/(\d+)/.exec(url);
            const id = match ? Number(match[1]) : 0;
            return {
                data: {
                    id,
                    title: `Movie ${id}`,
                    release_date: '2020-01-01',
                    poster_path: '/poster.jpg',
                    backdrop_path: '/bg.jpg',
                    overview: 'overview',
                    vote_average: 7.5,
                    genres: [],
                    external_ids: { imdb_id: `tt${id}` }
                }
            };
        }),
        interceptors: {
            response: { use: jest.fn() }
        }
    }))
}));

jest.mock('../src/cache/CacheManager', () => {
    return jest.fn().mockImplementation(() => ({
        get: jest.fn().mockResolvedValue(undefined),
        getWithStatus: jest.fn().mockResolvedValue({ value: undefined, status: 'miss' }),
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined)
    }));
});

const TmdbRequestCache = require('../src/models/TmdbRequestCache');
const { generateRequestHash } = require('../src/utils/requestHash');
const { isMovieReleasedDigitally } = require('../src/utils/releaseFilter');
const { fetchTmdbCatalog } = require('../src/clients/tmdb');

describe('fetchTmdbCatalog per-page cache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isMovieReleasedDigitally.mockResolvedValue(true);
    });

    it('returns cached items from page 1 cache when skip=0 and cache is fresh', async () => {
        const page1Items = Array.from({ length: 20 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.getWithStatus.mockResolvedValue({
            value: { stremioData: page1Items },
            status: 'fresh'
        });

        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn()
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 0, {}, 'movie');

        // skip=0 → page 1 → returns cached page 1 items
        expect(result).toEqual(page1Items);
        expect(client.get).not.toHaveBeenCalled();
    });

    it('returns cached items for page 2 when skip=20', async () => {
        const page2Items = Array.from({ length: 20 }, (_, i) => ({ id: `tmdb:${i + 21}` }));
        TmdbRequestCache.getWithStatus.mockResolvedValue({
            value: { stremioData: page2Items },
            status: 'fresh'
        });

        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn()
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 20, {}, 'movie');

        // skip=20 → page 2 → returns cached page 2 items
        expect(result).toHaveLength(20);
        expect(result[0]).toEqual({ id: 'tmdb:21' });
        expect(result[19]).toEqual({ id: 'tmdb:40' });
        expect(client.get).not.toHaveBeenCalled();
    });

    it('triggers background SWR when cache status is stale', async () => {
        const page2Items = Array.from({ length: 20 }, (_, i) => ({ id: `tmdb:${i + 21}` }));
        TmdbRequestCache.getWithStatus.mockResolvedValue({
            value: { stremioData: page2Items },
            status: 'stale'
        });

        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn().mockResolvedValue({ data: { results: [] } })
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 20, {}, 'movie');

        // Returns stale data immediately
        expect(result).toHaveLength(20);
        expect(result[0]).toEqual({ id: 'tmdb:21' });
    });

    it('fetches from TMDB on total cache miss (page 1 with enrichment)', async () => {
        TmdbRequestCache.getWithStatus.mockResolvedValue({
            value: undefined,
            status: 'miss'
        });

        const tmdbItems = Array.from({ length: 20 }, (_, i) => ({
            id: i + 1, title: `Movie ${i + 1}`, poster_path: '/poster.jpg', backdrop_path: '/bg.jpg',
            overview: 'test', vote_average: 7, release_date: '2020-01-01'
        }));
        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn().mockResolvedValue({ data: { results: tmdbItems, total_pages: 5 } })
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 0, {}, 'movie');

        // Should fetch from TMDB
        expect(client.get).toHaveBeenCalled();
        expect(result.length).toBeGreaterThan(0);
        // Should save to cache
        expect(TmdbRequestCache.set).toHaveBeenCalled();
    });

    it('uses Fast-Pass (light mode) on cache miss for deep pages (skip>0)', async () => {
        TmdbRequestCache.getWithStatus.mockResolvedValue({
            value: undefined,
            status: 'miss'
        });

        const tmdbItems = Array.from({ length: 20 }, (_, i) => ({
            id: i + 21, title: `Movie ${i + 21}`, name: null,
            poster_path: '/poster.jpg', backdrop_path: '/bg.jpg',
            overview: 'overview', vote_average: 7.5, release_date: '2020-01-01'
        }));
        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn().mockResolvedValue({ data: { results: tmdbItems } })
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 20, {}, 'movie');

        // Fast-Pass returns light metadata without deep enrichment
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty('id');
        expect(result[0]).toHaveProperty('name');
        expect(result[0]).toHaveProperty('poster');
    });

    it('returns Light Mode items with genre_ids for deep pages even when disableLightMode is enabled', async () => {
        TmdbRequestCache.getWithStatus.mockResolvedValue({
            value: undefined,
            status: 'miss'
        });

        const tmdbItems = Array.from({ length: 20 }, (_, i) => ({
            id: i + 21, title: `Movie ${i + 21}`, name: null,
            poster_path: '/poster.jpg', backdrop_path: '/bg.jpg',
            overview: 'overview', vote_average: 7.5, release_date: '2020-01-01',
            genre_ids: [28, 12]
        }));
        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn().mockResolvedValue({ data: { results: tmdbItems } })
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 20, {}, 'movie', { disableLightMode: true });

        expect(result.length).toBeGreaterThan(0);
        // Light Mode items always include genre_ids for scoring
        expect(result[0]).toHaveProperty('genre_ids');
        expect(result[0].genre_ids).toEqual([28, 12]);
    });

    it('per-page cache key includes page number', async () => {
        TmdbRequestCache.getWithStatus.mockResolvedValue({
            value: undefined,
            status: 'miss'
        });

        const tmdbItems = [{ id: 1, title: 'Movie 1', poster_path: '/p.jpg', backdrop_path: '/b.jpg', overview: '', vote_average: 5, release_date: '2020-01-01' }];
        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn().mockResolvedValue({ data: { results: tmdbItems } })
        };

        await fetchTmdbCatalog(client, '/discover/movie', 40, {}, 'movie');

        // skip=40 → page 3 → cache key should be hash:page:3
        const calledKey = TmdbRequestCache.getWithStatus.mock.calls[0][0];
        expect(calledKey).toContain(':page:3');
    });
});
