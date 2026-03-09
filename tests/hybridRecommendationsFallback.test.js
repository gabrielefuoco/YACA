const axios = require('axios');

jest.mock('axios', () => ({
    get: jest.fn()
}));

jest.mock('../src/utils/httpClient', () => ({
    createAxiosInstance: jest.fn(() => ({
        get: jest.fn()
    }))
}));

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

jest.mock('../src/models/RecommendationCache', () => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(null)
}));

const TasteProfile = require('../src/db/models/TasteProfile');
const tmdbClient = require('../src/clients/tmdb');
const { getHybridCatalog, recommendationsCache } = require('../src/engines/hybridRecommendations');

describe('hybrid recommendations popular fallback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        recommendationsCache.clear();
    });

    it('returns popular items when personalized recommendation ids are empty', async () => {
        TasteProfile.findOne
            .mockResolvedValueOnce({ lastUpdated: new Date() }) // stale-check in background sync
            .mockResolvedValue(null); // profile lookup in builders

        axios.get.mockResolvedValue({
            data: {
                results: [
                    { id: 101 },
                    { id: 102 }
                ]
            }
        });

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

        expect(axios.get).toHaveBeenCalledWith(
            'https://api.themoviedb.org/3/discover/movie',
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

        axios.get.mockResolvedValue({
            data: {
                results: [{ id: 201 }]
            }
        });

        tmdbClient.getTmdbMovieDetails.mockResolvedValueOnce(null);
        const tmdbGet = jest.fn().mockResolvedValue({
            data: {
                id: 201,
                title: 'Live Item',
                poster_path: '/live.jpg',
                vote_average: 8
            }
        });
        tmdbClient.createTmdbClient.mockReturnValueOnce({ get: tmdbGet });

        const metas = await getHybridCatalog(
            'yaca_signature_blend_movies',
            0,
            null,
            'tmdb_key',
            'user_1',
            'global'
        );

        expect(tmdbGet).toHaveBeenCalledWith('/movie/201');
        expect(metas).toHaveLength(1);
        expect(metas[0].id).toBe('tmdb:201');
    });
});
