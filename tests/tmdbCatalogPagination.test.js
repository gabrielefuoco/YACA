jest.mock('../src/models/TmdbRequestCache', () => ({
    get: jest.fn(),
    set: jest.fn().mockResolvedValue()
}));

jest.mock('../src/utils/requestHash', () => ({
    generateRequestHash: jest.fn(() => 'shared-hash')
}));

jest.mock('../src/utils/rateLimiter', () => ({
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
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined)
    }));
});

const TmdbRequestCache = require('../src/models/TmdbRequestCache');
const { generateRequestHash } = require('../src/utils/requestHash');
const { isMovieReleasedDigitally } = require('../src/utils/releaseFilter');
const { fetchTmdbCatalog } = require('../src/clients/tmdb');

describe('fetchTmdbCatalog hybrid pagination cache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isMovieReleasedDigitally.mockResolvedValue(true);
    });

    it('returns all cached items on first page (skip=0) from fresh cache', async () => {
        const cachedItems = Array.from({ length: 60 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({
            stremioData: cachedItems,
            total_results: 100,
            nextPage: 4,
            updatedAt: Date.now()
        });

        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn()
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 0, {}, 'movie');

        // skip=0 returns the full cached array so Stremio gets all prefetched items
        expect(result).toEqual(cachedItems);
        expect(client.get).not.toHaveBeenCalled();
    });

    it('returns correct slice from cache when skip is within cached range', async () => {
        const cachedItems = Array.from({ length: 60 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({
            stremioData: cachedItems,
            total_results: 100,
            nextPage: 4,
            updatedAt: Date.now()
        });

        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn()
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 20, {}, 'movie');

        // skip=20 should slice [20, 40) from the 60-item cache
        expect(result).toHaveLength(20);
        expect(result[0]).toEqual({ id: 'tmdb:21' });
        expect(result[19]).toEqual({ id: 'tmdb:40' });
        expect(client.get).not.toHaveBeenCalled();
    });

    it('synchronously extends cache when skip goes beyond cached items', async () => {
        const cachedItems = Array.from({ length: 60 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({
            stremioData: cachedItems,
            total_results: 200,
            nextPage: 4,
            updatedAt: Date.now()
        });

        // TMDB page 4 returns items 61-80
        const tmdbPageItems = Array.from({ length: 20 }, (_, i) => ({ id: i + 61, title: `Movie ${i + 61}` }));
        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn().mockResolvedValue({ data: { results: tmdbPageItems, total_pages: 10 } })
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 60, {}, 'movie');

        // Should synchronously fetch page 4, merge into cache, and return slice
        expect(result.length).toBeGreaterThan(0);
        expect(client.get).toHaveBeenCalled();
        // Verify cache was updated
        expect(TmdbRequestCache.set).toHaveBeenCalled();
    });

    it('returns empty array when catalog is exhausted (nextPage === -1)', async () => {
        const cachedItems = Array.from({ length: 40 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({
            stremioData: cachedItems,
            total_results: 40,
            nextPage: -1,
            updatedAt: Date.now()
        });

        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn()
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 40, {}, 'movie');

        // Catalog exhausted — no more items
        expect(result).toEqual([]);
        expect(client.get).not.toHaveBeenCalled();
    });

    it('falls through to fresh fetch when cache has no nextPage info', async () => {
        const cachedItems = Array.from({ length: 20 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({
            stremioData: cachedItems,
            total_results: 100
            // nextPage and updatedAt intentionally missing
        });

        const tmdbPageItems = Array.from({ length: 20 }, (_, i) => ({ id: i + 21, title: `Movie ${i + 21}` }));
        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn().mockResolvedValue({ data: { results: tmdbPageItems, total_pages: 5 } })
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 20, {}, 'movie');

        // Should fall through to cache miss path and fetch from TMDB directly
        expect(client.get).toHaveBeenCalled();
    });

    it('triggers background SWR when cache is stale but has items for range', async () => {
        const cachedItems = Array.from({ length: 60 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({
            stremioData: cachedItems,
            total_results: 200,
            nextPage: 4,
            updatedAt: 0 // Very old → stale
        });

        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn().mockResolvedValue({ data: { results: [] } })
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 20, {}, 'movie');

        // Returns cached slice immediately even though stale
        expect(result).toHaveLength(20);
        expect(result[0]).toEqual({ id: 'tmdb:21' });
    });
});
