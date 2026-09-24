const {
    fetchProfileContext,
    fetchTraktRecommendationsRaw,
    fetchPopularFallbackIds,
    fetchTopRatedPeriodFallbackIds,
    fetchUndiscoveredFallbackIds,
    fetchHiddenGemsFallbackIds
} = require('../src/engines/hybrid/dataFetchers');
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
    },
    smartTraktRefresh: jest.fn()
}));

jest.mock('../src/cache/cacheInstances', () => ({
    getTmdbPopularCache: jest.fn(() => ({ getOrFetch: jest.fn() })),
    getTmdbTopRatedCache: jest.fn(() => ({ getOrFetch: jest.fn() }))
}));

jest.mock('../src/models/UserConfig', () => ({
    resolveUserConfig: jest.fn()
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbCatalogFromFilters: jest.fn()
}));

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn(() => ({ lean: jest.fn() }))
}));

describe('dataFetchers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });



    describe('fetchPopularFallbackIds', () => {
        it('should fetch from TMDB discover (now DuckDb)', async () => {
            const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
            getDuckDbCatalogFromFilters.mockResolvedValue([{ id: 101 }, { id: 102 }]);
            const result = await fetchPopularFallbackIds('key', 'movie');
            expect(result).toEqual(['101', '102']);
        });
    });

    describe('fetchHiddenGemsFallbackIds', () => {
        it('should fetch from TMDB discover and filter by popularity (now DuckDb)', async () => {
            const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
            getDuckDbCatalogFromFilters.mockResolvedValue([{ id: 101, popularity: 50 }, { id: 102, popularity: 90 }]);
            const { fetchHiddenGemsFallbackIds } = require('../src/engines/hybrid/dataFetchers');
            const result = await fetchHiddenGemsFallbackIds('key', 'tv');
            expect(result).toEqual(['101']); // 102 filtered out (popularity > 80)
        });
    });

    describe('fallback hero distinti', () => {
        it('seleziona top-rated nella finestra mobile e usa ID come tie-breaker', async () => {
            const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
            getDuckDbCatalogFromFilters.mockResolvedValue([
                { id: 20, vote_average: 8, vote_count: 500 },
                { id: 10, vote_average: 8, vote_count: 500 }
            ]);

            const result = await fetchTopRatedPeriodFallbackIds('key', 'movie');

            expect(result).toEqual(['10', '20']);
            expect(getDuckDbCatalogFromFilters.mock.calls[0][0]).toEqual(expect.objectContaining({
                sort_by: 'vote_average.desc',
                'primary_release_date.gte': expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
            }));
        });

        it('seleziona novità per tipo e deduplica gli ID', async () => {
            const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
            getDuckDbCatalogFromFilters.mockResolvedValue([
                { id: 20, release_date: '2025-02-01', vote_average: 8 },
                { id: 10, release_date: '2025-02-01', vote_average: 8 },
                { id: 'tmdb:10', release_date: '2026-01-01', vote_average: 9 },
                { id: 30, release_date: '2026-01-01', vote_average: 7 }
            ]);

            const result = await fetchUndiscoveredFallbackIds('key', 'movie');

            expect(result).toEqual(['30', '10', '20']);
            expect(getDuckDbCatalogFromFilters.mock.calls[0][0]).toEqual(expect.objectContaining({
                sort_by: 'primary_release_date.desc',
                'primary_release_date.gte': expect.any(String)
            }));
        });
    });

    describe('fetchTmdbSimilarCounts', () => {
        it.skip('should fetch recommendations and count frequencies', async () => {
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

        it('safeTraktFetch should attempt refresh on 403 if refreshToken is present and retry', async () => {
            process.env.TRAKT_CLIENT_ID = 'test_client';
            const { smartTraktRefresh } = require('../src/clients/trakt');
            smartTraktRefresh.mockResolvedValueOnce({
                access_token: 'new_token',
                refresh_token: 'new_refresh'
            });

            const error403 = new Error('Forbidden');
            error403.response = { status: 403 };

            traktClient.get
                .mockRejectedValueOnce(error403)
                .mockResolvedValueOnce({ data: [{ id: 42, title: 'Refreshed Item' }] });

            const userObj = {
                userId: 'user_123',
                apiKeys: { trakt: 'old_token', traktRefreshToken: 'refresh_123' }
            };

            const res = await safeTraktFetch('/recommendations/movies', 'old_token', 10, userObj);

            expect(smartTraktRefresh).toHaveBeenCalledWith('user_123', 'refresh_123');
            expect(userObj.apiKeys.trakt).toBe('new_token');
            expect(res).toEqual([{ id: 42, title: 'Refreshed Item' }]);
        });

        it('safeTraktFetch should return empty array if retry fails after 403 refresh', async () => {
            process.env.TRAKT_CLIENT_ID = 'test_client';
            const { smartTraktRefresh } = require('../src/clients/trakt');
            smartTraktRefresh.mockResolvedValueOnce({
                access_token: 'new_token',
                refresh_token: 'new_refresh'
            });

            const error403 = new Error('Forbidden');
            error403.response = { status: 403 };

            traktClient.get
                .mockRejectedValueOnce(error403)
                .mockRejectedValueOnce(error403);

            const userObj = {
                userId: 'user_123',
                apiKeys: { trakt: 'old_token', traktRefreshToken: 'refresh_123' }
            };

            const res = await safeTraktFetch('/recommendations/movies', 'old_token', 10, userObj);

            expect(smartTraktRefresh).toHaveBeenCalledTimes(1);
            expect(res).toEqual([]);
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

    describe('fallback with isKidsMode', () => {
        it('fetchPopularFallbackIds filters out adult items when isKidsMode is true', async () => {
            const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
            getDuckDbCatalogFromFilters.mockResolvedValue([
                { id: 101, title: 'Safe Movie', genre_ids: [28, 12] },
                { id: 102, title: 'Horror Movie', genre_ids: [27] }
            ]);

            const res = await fetchPopularFallbackIds('key', 'movie', 60, true);
            expect(res).toContain('101');
            expect(res).not.toContain('102');
        });
    });
});
