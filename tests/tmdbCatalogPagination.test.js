jest.mock('../src/models/TmdbRequestCache', () => ({
    get: jest.fn(),
    set: jest.fn().mockResolvedValue()
}));

jest.mock('../src/utils/requestHash', () => ({
    generateRequestHash: jest.fn(() => 'shared-hash')
}));

jest.mock('../src/utils/rateLimiter', () => ({
    rateLimitedMapFiltered: jest.fn()
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
        })
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

    it('returns paginated slice from shared fresh cache without background prefetching on first page', async () => {
        const cachedItems = Array.from({ length: 35 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({ isStale: false, stremioData: cachedItems, total_results: 100 });

        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn()
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 0, {}, 'movie');

        expect(result).toEqual(cachedItems.slice(0, 20));
        expect(client.get).not.toHaveBeenCalled();
        expect(TmdbRequestCache.set).not.toHaveBeenCalled(); // No prefetch on page 1 (skip=0)
    });

    it('passes custom cache TTL to shared cache reads', async () => {
        const cachedItems = Array.from({ length: 20 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({ isStale: false, stremioData: cachedItems, total_results: 20 });

        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn()
        };

        await fetchTmdbCatalog(client, '/discover/movie', 0, {}, 'movie', { cacheTtlMs: 30 * 60 * 1000 });

        expect(TmdbRequestCache.get).toHaveBeenCalledWith('shared-hash', 30 * 60 * 1000);
    });

    it('fetches and merges next page when cache does not cover requested skip', async () => {
        const cachedItems = Array.from({ length: 20 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({ isStale: false, stremioData: cachedItems, total_results: 100 });

        const tmdbPageItems = Array.from({ length: 20 }, (_, i) => ({ id: i + 21, title: `Movie ${i + 21}` }));
        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn().mockResolvedValue({ data: { results: tmdbPageItems, total_pages: 5 } })
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 20, {}, 'movie');

        expect(result).toHaveLength(20);
        expect(TmdbRequestCache.set).toHaveBeenCalled();
        const mergedItems = TmdbRequestCache.set.mock.calls[0][2];
        expect(mergedItems).toHaveLength(40);
        // Page 3 prefetch
        expect(TmdbRequestCache.set.mock.calls[0][3]).toBe(3);
    });

    it('refreshes deep pagination synchronously when shared cache is stale', async () => {
        const cachedItems = Array.from({ length: 25 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({ isStale: true, stremioData: cachedItems });

        const tmdbPageItems = Array.from({ length: 20 }, (_, i) => ({ id: i + 21, title: `Movie ${i + 21}` }));
        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn().mockResolvedValue({ data: { results: tmdbPageItems } })
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 20, {}, 'movie');

        // Should call TMDB to get pages (p1, p2, p3 to reach index 20-40)
        // Since skip=20, we need p2 results. But we fetch from start if stale to rebuild cache? 
        // In fetchTmdbCatalog, if stale, it fetches page 1 and page 2.
        // Actually, it calls fetchMultiplePages(1, 2) which is 2 calls.
        expect(client.get).toHaveBeenCalled();
        expect(result).toHaveLength(20);
    });
});
