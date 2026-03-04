jest.mock('axios', () => ({
    get: jest.fn()
}));

jest.mock('../src/db/models/TasteProfile', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/User', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn()
}));

jest.mock('../src/profile/ProfileScorer', () => ({
    calculateItemMatch: jest.fn(() => 0),
    applyDiversityCaps: jest.fn(items => items)
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMovieDetails: jest.fn(),
    getTmdbMetaDetails: jest.fn()
}));

const axios = require('axios');
const ProfileBuilder = require('../src/profile/ProfileBuilder');
const { syncIncrementalRecommendations } = require('../src/engines/hybridRecommendations');

describe('syncIncrementalRecommendations', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...ORIGINAL_ENV, TRAKT_CLIENT_ID: 'trakt_client_id' };
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it('syncs movie history via ProfileBuilder', async () => {
        const history = [{ movie: { ids: { tmdb: 123 } } }];
        axios.get.mockResolvedValueOnce({ data: history });
        ProfileBuilder.syncUserHistory.mockResolvedValueOnce({});

        const result = await syncIncrementalRecommendations('u1', 'movie', 'trakt_token', 'tmdb_key');

        expect(result).toBe(true);
        expect(axios.get).toHaveBeenCalledWith(
            expect.stringContaining('/history/movies'),
            expect.any(Object)
        );
        expect(ProfileBuilder.syncUserHistory).toHaveBeenCalledWith('u1', 'global', history, 'tmdb_key');
    });

    it('returns false when required params are missing', async () => {
        const result = await syncIncrementalRecommendations('u1', 'movie', null, 'tmdb_key');
        expect(result).toBe(false);
        expect(ProfileBuilder.syncUserHistory).not.toHaveBeenCalled();
    });
});
