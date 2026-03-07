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
    getTmdbMetaDetails: jest.fn()
}));

jest.mock('../src/models/RecommendationCache', () => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(null)
}));

const TasteProfile = require('../src/db/models/TasteProfile');
const tmdbClient = require('../src/clients/tmdb');
const { getHybridCatalog } = require('../src/engines/hybridRecommendations');

describe('hybrid recommendations popular fallback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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

        tmdbClient.getTmdbMetaDetails
            .mockResolvedValueOnce({ id: 'tmdb:101', name: 'Popular A' })
            .mockResolvedValueOnce({ id: 'tmdb:102', name: 'Popular B' });

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
    });
});
