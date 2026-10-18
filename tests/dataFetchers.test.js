const { fetchPopularFallbackIds } = require('../src/pool/composer');
const {
    safeTraktFetch,
    fetchRecentHistory,
    fetchRecentRatings
} = require('../src/library/traktFetchers');
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

    describe('fallback deduplicazione collection e regista', () => {
        it('deduplica collection e regista anche nei fallback', async () => {
            const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
            getDuckDbCatalogFromFilters.mockResolvedValue([
                { id: 1, popularity: 30, collection_id: 900, directors: [{ id: 55, job: 'Director' }] },
                { id: 2, popularity: 20, collection_id: 900, directors: [{ id: 66, job: 'Director' }] },
                { id: 3, popularity: 10, collection_id: 901, directors: [{ id: 55, job: 'Director' }] },
                { id: 4, popularity: 5, directors: [{ id: 77, job: 'Director' }] }
            ]);

            const result = await fetchPopularFallbackIds('key', 'movie');

            expect(result).toEqual(['1', '4']);
        });
    });

    describe('trakt fetchers', () => {
        const { traktClient } = require('../src/clients/trakt');
        const { safeTraktFetch, fetchRecentHistory, fetchRecentRatings } = require('../src/library/traktFetchers');

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
