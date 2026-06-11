const { fetchTmdbResults, fetchProfileContext, fetchTraktRecommendationsRaw, fetchPopularFallbackIds, fetchHiddenGemsFallbackIds } = require('../src/engines/hybrid/dataFetchers');
const tmdb = require('../src/clients/tmdb');
const { getTmdbPopularCache, getTmdbTopRatedCache } = require('../src/cache/cacheInstances');
const UserConfig = require('../src/models/UserConfig');

jest.mock('../src/clients/tmdb', () => ({
    createTmdbClient: jest.fn(() => ({
        get: jest.fn()
    }))
}));

jest.mock('../src/clients/trakt', () => ({
    traktClient: {
        get: jest.fn()
    }
}));

jest.mock('../src/cache/cacheInstances', () => ({
    getTmdbPopularCache: jest.fn(() => ({ getOrFetch: jest.fn() })),
    getTmdbTopRatedCache: jest.fn(() => ({ getOrFetch: jest.fn() }))
}));

jest.mock('../src/models/UserConfig', () => ({
    resolveUserConfig: jest.fn()
}));

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn(() => ({ lean: jest.fn() }))
}));

describe('dataFetchers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('fetchTmdbResults', () => {
        it('should fetch results successfully', async () => {
            const client = { get: jest.fn().mockResolvedValue({ data: { results: [{ id: 1 }] } }) };
            const result = await fetchTmdbResults(client, '/path', {}, 'label');
            expect(result).toEqual([{ id: 1 }]);
        });

        it('should return empty array on failure', async () => {
            const client = { get: jest.fn().mockRejectedValue(new Error('fail')) };
            const result = await fetchTmdbResults(client, '/path', {}, 'label');
            expect(result).toEqual([]);
        });
    });

    describe('fetchPopularFallbackIds', () => {
        it('should fetch from TMDB discover', async () => {
            const client = { get: jest.fn().mockResolvedValue({ data: { results: [{ id: 101 }, { id: 102 }] } }) };
            tmdb.createTmdbClient.mockReturnValue(client);
            const result = await fetchPopularFallbackIds('key', 'movie');
            expect(result).toEqual(['101', '102']);
        });
    });

    describe('fetchHiddenGemsFallbackIds', () => {
        it('should fetch from TMDB discover and filter by popularity', async () => {
            const client = { get: jest.fn().mockResolvedValue({ data: { results: [{ id: 101, popularity: 50 }, { id: 102, popularity: 90 }] } }) };
            tmdb.createTmdbClient.mockReturnValue(client);
            const { fetchHiddenGemsFallbackIds } = require('../src/engines/hybrid/dataFetchers');
            const result = await fetchHiddenGemsFallbackIds('key', 'tv');
            expect(result).toEqual(['101']); // 102 filtered out (popularity > 80)
        });
    });

    describe('fetchTmdbSimilarCounts', () => {
        it('should fetch recommendations and count frequencies', async () => {
            const client = { get: jest.fn()
                .mockResolvedValueOnce({ data: { results: [{ id: 1 }, { id: 2 }] } })
                .mockResolvedValueOnce({ data: { results: [{ id: 2 }, { id: 3 }] } })
            };
            tmdb.createTmdbClient.mockReturnValue(client);
            const { fetchTmdbSimilarCounts } = require('../src/engines/hybrid/dataFetchers');
            
            const counts = await fetchTmdbSimilarCounts([100, 200], 'key', 'movie');
            expect(counts.get(1)).toBe(1);
            expect(counts.get(2)).toBe(2);
            expect(counts.get(3)).toBe(1);
        });

        it('should return empty map if no seeds', async () => {
            const { fetchTmdbSimilarCounts } = require('../src/engines/hybrid/dataFetchers');
            const counts = await fetchTmdbSimilarCounts([], 'key', 'movie');
            expect(counts.size).toBe(0);
        });
    });

    describe('trakt fetchers', () => {
        const { traktClient } = require('../src/clients/trakt');
        const { safeTraktFetch, fetchRecentHistory, fetchRecentRatings, fetchTraktRecommendationsRaw } = require('../src/engines/hybrid/dataFetchers');

        it('safeTraktFetch should return empty on missing token', async () => {
            const result = await safeTraktFetch('/test', null);
            expect(result).toEqual([]);
        });

        it('safeTraktFetch should return empty on request failure', async () => {
            traktClient.get.mockRejectedValueOnce(new Error('fail'));
            process.env.TRAKT_CLIENT_ID = 'test';
            const result = await safeTraktFetch('/test', 'token');
            expect(result).toEqual([]);
        });

        it('safeTraktFetch should return data on success', async () => {
            traktClient.get.mockResolvedValueOnce({ data: [{ id: 1 }] });
            process.env.TRAKT_CLIENT_ID = 'test';
            const result = await safeTraktFetch('/test', 'token');
            expect(result).toEqual([{ id: 1 }]);
        });

        it('fetchRecentHistory calls safeTraktFetch', async () => {
            traktClient.get.mockResolvedValueOnce({ data: [{ type: 'history' }] });
            const res = await fetchRecentHistory('token', 'movies');
            expect(res).toEqual([{ type: 'history' }]);
        });

        it('fetchRecentRatings calls safeTraktFetch', async () => {
            traktClient.get.mockResolvedValueOnce({ data: [{ type: 'ratings' }] });
            const res = await fetchRecentRatings('token', 'shows');
            expect(res).toEqual([{ type: 'ratings' }]);
        });
    });
});
