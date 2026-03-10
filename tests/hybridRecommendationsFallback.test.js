jest.mock('../src/db/models/TasteProfile', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/User', () => ({
    findOne: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/profile/ProfileScorer', () => ({
    calculateItemMatch: jest.fn(() => 0),
    applyDiversityCaps: jest.fn(items => items)
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMovieDetails: jest.fn().mockResolvedValue(null),
    getTmdbMetaDetails: jest.fn(),
    createTmdbClient: jest.fn(() => ({
        get: jest.fn()
    }))
}));

jest.mock('../src/cache/cacheInstances', () => ({
    hybridRecommendationsCache: {
        getWithStatus: jest.fn().mockResolvedValue({ value: null, status: 'miss' }),
        set: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(null),
        clear: jest.fn().mockResolvedValue(null)
    }
}));

jest.mock('../src/clients/trakt', () => ({
    traktClient: {
        get: jest.fn()
    }
}));

const TasteProfile = require('../src/db/models/TasteProfile');
const tmdbClient = require('../src/clients/tmdb');
const { getHybridCatalog, recommendationsCache } = require('../src/engines/hybridRecommendations');

describe('hybrid recommendations popular fallback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        recommendationsCache.clear.mockResolvedValue(null);
    });

    it('returns popular items when personalized recommendation ids are empty', async () => {
        TasteProfile.findOne
            .mockResolvedValueOnce({ lastUpdated: new Date() }) // stale-check in background sync
            .mockResolvedValue(null); // profile lookup in builders

        const tmdbGet = jest.fn().mockResolvedValue({
            data: {
                results: [
                    { id: 101 },
                    { id: 102 }
                ]
            }
        });
        tmdbClient.createTmdbClient.mockReturnValue({ get: tmdbGet });

        tmdbClient.getTmdbMovieDetails
            .mockResolvedValueOnce({
                id: 101,
                title: 'Popular A',
                poster_path: '/a.jpg',
                vote_average: 7.2,
                genre_ids: [28]
            })
            .mockResolvedValueOnce({
                id: 102,
                title: 'Popular B',
                poster_path: '/b.jpg',
                vote_average: 7.1,
                genre_ids: [35]
            });

        const metas = await getHybridCatalog(
            'yaca_signature_blend_movies',
            0,
            null,
            'tmdb_key',
            'user_1',
            'global'
        );

        expect(tmdbGet).toHaveBeenCalledWith(
            '/discover/movie',
            expect.objectContaining({
                params: expect.objectContaining({ sort_by: 'popularity.desc' })
            })
        );
        expect(metas).toHaveLength(2);
        expect(metas[0].id).toBe('tmdb:101');
        expect(tmdbClient.getTmdbMovieDetails).toHaveBeenNthCalledWith(1, 'tmdb_key', '101', 'movie', { cacheOnly: true });
        expect(tmdbClient.getTmdbMovieDetails).toHaveBeenNthCalledWith(2, 'tmdb_key', '102', 'movie', { cacheOnly: true });
    });

    it('falls back to live TMDB endpoint when details are not cached', async () => {
        TasteProfile.findOne
            .mockResolvedValueOnce({ lastUpdated: new Date() })
            .mockResolvedValue(null);

        const tmdbFallbackGet = jest.fn()
            .mockResolvedValueOnce({
                data: {
                    results: [{ id: 201 }]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    id: 201,
                    title: 'Live Item',
                    poster_path: '/live.jpg',
                    vote_average: 8
                }
            });
        tmdbClient.createTmdbClient.mockReturnValue({ get: tmdbFallbackGet });

        tmdbClient.getTmdbMovieDetails.mockResolvedValueOnce(null);

        const metas = await getHybridCatalog(
            'yaca_signature_blend_movies',
            0,
            null,
            'tmdb_key',
            'user_1',
            'global'
        );

        expect(tmdbFallbackGet).toHaveBeenCalledWith('/movie/201');
        expect(metas).toHaveLength(1);
        expect(metas[0].id).toBe('tmdb:201');
    });
});
