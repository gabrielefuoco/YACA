const mockTraktGet = jest.fn();
const MAX_POLLING_ATTEMPTS = 20;
const POLLING_INTERVAL_MS = 10;

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn().mockResolvedValue({})
}));

jest.mock('../src/profile/ProfileScorer', () => ({
    calculateItemMatch: jest.fn(() => 0),
    applyDiversityCaps: jest.fn(items => items)
}));

jest.mock('../src/cache/cacheInstances', () => ({
    hybridRecommendationsCache: {
        getWithStatus: jest.fn(),
        set: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(null),
        clear: jest.fn().mockResolvedValue(null)
    }
}));

jest.mock('../src/clients/trakt', () => ({
    traktClient: {
        get: mockTraktGet
    }
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMovieDetails: jest.fn(),
    getTmdbMetaDetails: jest.fn(),
    createTmdbClient: jest.fn(() => ({ get: jest.fn() }))
}));

const TasteProfile = require('../src/models/TasteProfile');
const { hybridRecommendationsCache } = require('../src/cache/cacheInstances');
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
        hybridRecommendationsCache.getWithStatus.mockResolvedValue({
            value: { ids: ['123'] },
            status: 'fresh'
        });

        const history = [{ movie: { ids: { tmdb: 123 } }, watched_at: '2026-01-01T00:00:00Z' }];
        const ratings = [{ movie: { ids: { tmdb: 456 } }, rating: 10 }];
        mockTraktGet
            .mockResolvedValueOnce({ data: history })
            .mockResolvedValueOnce({ data: ratings });
        tmdb.getTmdbMovieDetails.mockResolvedValue({
            id: 123,
            title: 'Item',
            vote_average: 7.5,
            genre_ids: [18]
        });

        await getHybridCatalog('yaca_seed_network_movies', 0, 'trakt_token', 'tmdb_key', 'user_1', 'global');
        for (let i = 0; i < MAX_POLLING_ATTEMPTS && ProfileBuilder.syncUserHistory.mock.calls.length === 0; i++) {
            await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
        }

        expect(ProfileBuilder.syncUserHistory).toHaveBeenCalledWith(
            'user_1',
            'global',
            [...history, ...ratings],
            'tmdb_key'
        );
    });
});
