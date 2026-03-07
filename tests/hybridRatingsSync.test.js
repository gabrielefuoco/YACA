const mockTraktGet = jest.fn();

jest.mock('../src/utils/httpClient', () => ({
    createAxiosInstance: jest.fn(() => ({
        get: mockTraktGet
    }))
}));

jest.mock('../src/db/models/TasteProfile', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/User', () => ({
    findOne: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn().mockResolvedValue({})
}));

jest.mock('../src/profile/ProfileScorer', () => ({
    calculateItemMatch: jest.fn(() => 0),
    applyDiversityCaps: jest.fn(items => items)
}));

jest.mock('../src/models/RecommendationCache', () => ({
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMovieDetails: jest.fn(),
    getTmdbMetaDetails: jest.fn()
}));

const TasteProfile = require('../src/db/models/TasteProfile');
const RecommendationCache = require('../src/models/RecommendationCache');
const ProfileBuilder = require('../src/profile/ProfileBuilder');
const tmdb = require('../src/clients/tmdb');
const { getHybridCatalog } = require('../src/engines/hybridRecommendations');

describe('hybrid catalog stale sync merges history and ratings', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...ORIGINAL_ENV, TRAKT_CLIENT_ID: 'trakt_client_id' };
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it('combines trakt history and ratings before syncing profile', async () => {
        TasteProfile.findOne.mockResolvedValue({ lastUpdated: new Date(0) });
        RecommendationCache.get.mockResolvedValue({
            ids: ['123'],
            updatedAt: Date.now()
        });

        const history = [{ movie: { ids: { tmdb: 123 } }, watched_at: '2026-01-01T00:00:00Z' }];
        const ratings = [{ movie: { ids: { tmdb: 456 } }, rating: 10 }];
        mockTraktGet
            .mockResolvedValueOnce({ data: history })
            .mockResolvedValueOnce({ data: ratings });
        tmdb.getTmdbMetaDetails.mockResolvedValue({ id: 'tmdb:123', name: 'Item' });

        await getHybridCatalog('yaca_hybrid_movies', 0, 'trakt_token', 'tmdb_key', 'user_1', 'global');
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockTraktGet).toHaveBeenCalledWith(expect.stringContaining('/history/movies'), expect.any(Object));
        expect(mockTraktGet).toHaveBeenCalledWith(expect.stringContaining('/ratings/movies'), expect.any(Object));
        expect(ProfileBuilder.syncUserHistory).toHaveBeenCalledWith(
            'user_1',
            'global',
            [...history, ...ratings],
            'tmdb_key'
        );
    });
});
