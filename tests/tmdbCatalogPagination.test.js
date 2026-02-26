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

const TmdbRequestCache = require('../src/models/TmdbRequestCache');
const { generateRequestHash } = require('../src/utils/requestHash');
const { rateLimitedMapFiltered } = require('../src/utils/rateLimiter');
const { fetchTmdbCatalog } = require('../src/clients/tmdb');

describe('fetchTmdbCatalog hybrid pagination cache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns paginated slice from shared fresh cache without calling TMDB', async () => {
        const cachedItems = Array.from({ length: 35 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({ isStale: false, stremioData: cachedItems });

        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn()
        };

        const result = await fetchTmdbCatalog(client, '/discover/movie', 20, {}, 'movie');

        expect(result).toEqual(cachedItems.slice(20, 40));
        expect(client.get).not.toHaveBeenCalled();
        expect(generateRequestHash).toHaveBeenCalledWith('/discover/movie', {}, 0, 'movie');
    });

    it('passes custom cache TTL to shared cache reads', async () => {
        const cachedItems = Array.from({ length: 20 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({ isStale: false, stremioData: cachedItems });

        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn()
        };

        await fetchTmdbCatalog(client, '/discover/movie', 0, {}, 'movie', { cacheTtlMs: 30 * 60 * 1000 });

        expect(TmdbRequestCache.get).toHaveBeenCalledWith('shared-hash', 30 * 60 * 1000);
    });

    it('fetches and merges next page when cache does not cover requested skip', async () => {
        const cachedItems = Array.from({ length: 20 }, (_, i) => ({ id: `tmdb:${i + 1}` }));
        TmdbRequestCache.get.mockResolvedValue({ isStale: false, stremioData: cachedItems });

        const tmdbPageItems = Array.from({ length: 20 }, (_, i) => ({ id: i + 21 }));
        const client = {
            defaults: { params: { api_key: 'key' } },
            get: jest.fn().mockResolvedValue({ data: { results: tmdbPageItems } })
        };

        rateLimitedMapFiltered.mockImplementation(async (items) => (
            items.map(({ item }) => ({ id: `tmdb:${item.id}` }))
        ));

        const result = await fetchTmdbCatalog(client, '/discover/movie', 20, {}, 'movie');

        const expectedItems = [...cachedItems, ...Array.from({ length: 20 }, (_, i) => ({ id: `tmdb:${i + 21}` }))];
        expect(result).toEqual(expectedItems.slice(20, 40));
        expect(client.get).toHaveBeenCalledTimes(1);
        expect(TmdbRequestCache.set).toHaveBeenCalledWith(
            'shared-hash',
            '/discover/movie',
            expectedItems
        );
    });
});
