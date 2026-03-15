const mockTraktGet = jest.fn();

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/AddonConfig', () => ({
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

jest.mock('../src/clients/trakt', () => ({
    traktClient: {
        get: mockTraktGet
    }
}));

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
        const ratings = [{ movie: { ids: { tmdb: 456 } }, rating: 9 }];
        mockTraktGet
            .mockResolvedValueOnce({ data: history })
            .mockResolvedValueOnce({ data: ratings });
        ProfileBuilder.syncUserHistory.mockResolvedValueOnce({});

        const result = await syncIncrementalRecommendations('u1', 'movie', 'trakt_token', 'tmdb_key');

        expect(result).toBe(true);
        expect(mockTraktGet).toHaveBeenCalledWith(
            expect.stringContaining('/history/movies'),
            expect.any(Object)
        );
        expect(mockTraktGet).toHaveBeenCalledWith(
            expect.stringContaining('/ratings/movies'),
            expect.any(Object)
        );
        expect(ProfileBuilder.syncUserHistory).toHaveBeenCalledWith('u1', 'global', [...history, ...ratings], 'tmdb_key');
    });

    it('returns false when required params are missing', async () => {
        const result = await syncIncrementalRecommendations('u1', 'movie', null, 'tmdb_key');
        expect(result).toBe(false);
        expect(ProfileBuilder.syncUserHistory).not.toHaveBeenCalled();
    });

    it('skips duplicate background syncs while the same profile lock is active', async () => {
        const history = [{ movie: { ids: { tmdb: 123 } } }];
        let releaseHistory;
        mockTraktGet
            .mockImplementationOnce(() => new Promise((resolve) => {
                releaseHistory = () => resolve({ data: history });
            }))
            .mockResolvedValueOnce({ data: [] });

        const firstRun = syncIncrementalRecommendations('u1', 'movie', 'trakt_token', 'tmdb_key', 'ctx');
        await Promise.resolve();
        const secondRun = await syncIncrementalRecommendations('u1', 'movie', 'trakt_token', 'tmdb_key', 'ctx');

        releaseHistory();
        await firstRun;

        expect(secondRun).toBe(false);
        expect(ProfileBuilder.syncUserHistory).toHaveBeenCalledTimes(1);
    });
});
