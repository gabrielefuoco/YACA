jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) })
}));

jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) })
}));

jest.mock('../src/models/RecommendationImpression', () => ({
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
}));

jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/profile/ProfileScorer', () => ({
    calculateLightScore: jest.fn((data) => data.vote_average || 0),
    calculateItemMatch: jest.fn((data) => data.vote_average || 0)
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbIdByName: jest.fn(),
    getTmdbMovieDetails: jest.fn().mockResolvedValue(null),
    createTmdbClient: jest.fn(),
    getTmdbResults: jest.fn()
}));

jest.mock('../src/utils/rateLimiter', () => ({
    rateLimitedMap: jest.fn(async (items, fn) => Promise.all(items.map(fn)))
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

jest.mock('../src/ai/querySynthesizer', () => ({
    generateDiscoveryQueries: jest.fn().mockResolvedValue([{ genre_ids: [18], keyword: 'slow burn' }])
}), { virtual: true });

const TasteProfile = require('../src/models/TasteProfile');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const tmdb = require('../src/clients/tmdb');
const { generateDiscoveryQueries } = require('../src/ai/querySynthesizer');
const {
    resolveAiQueryToTmdbParams,
    buildHiddenGemsCatalog,
    buildTopGenresMixCatalog
} = require('../src/engines/hybridRecommendations');

describe.skip('hybridRecommendations review fixes', () => {
    let tmdbGet;

    beforeEach(() => {
        jest.clearAllMocks();
        tmdbGet = jest.fn().mockResolvedValue({ data: { results: [] } });
        tmdb.createTmdbClient.mockReturnValue({ get: tmdbGet });
    });

    it('buildHiddenGemsCatalog keeps quality sort_by precedence over AI sort_by', async () => {
        TasteProfile.findOne
            .mockResolvedValueOnce({
                owner: 'u1',
                context: 'ctx',
                ratings: [{ genres: [18, 53] }]
            })
            .mockResolvedValueOnce(null);
        UserAccount.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({
            userId: 'u1',
            apiKeys: { mistral: 'm-key' },
            addonUuid: 'uuid-1'
        }) });
        AddonConfig.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({
            uuid: 'uuid-1',
            profiles: [{ id: 'ctx', settings: {} }]
        }) });

        await buildHiddenGemsCatalog('u1', 'ctx', 'tmdb-key', 'movie');

        const firstCallParams = tmdbGet.mock.calls[0][1].params;
        expect(firstCallParams.sort_by).toBe('vote_average.desc');
    });

    it('uses mistral key from UserAccount when AddonConfig profile data exists', async () => {
        generateDiscoveryQueries.mockResolvedValueOnce([]);
        TasteProfile.findOne
            .mockResolvedValueOnce({
                owner: 'u1',
                context: 'ctx',
                genreScores: new Map([['18', 10]]),
                keywordScores: new Map()
            })
            .mockResolvedValueOnce(null);
        UserAccount.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({
            userId: 'u1',
            apiKeys: { mistral: 'm-key' },
            addonUuid: 'uuid-1'
        }) });
        AddonConfig.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({
            uuid: 'uuid-1',
            profiles: [{ id: 'ctx', settings: {} }]
        }) });
        tmdbGet.mockResolvedValue({ data: { results: [] } });

        await buildTopGenresMixCatalog('u1', 'ctx', 'tmdb-key', 'movie');

        expect(generateDiscoveryQueries).toHaveBeenCalledWith(
            expect.any(Object),
            'm-key',
            'trueBlend',
            expect.objectContaining({
                profiles: expect.any(Array),
                apiKeys: { mistral: 'm-key' }
            }),
            'ctx'
        );
    });

    it('uses mistral key fallback when AddonConfig is missing', async () => {
        generateDiscoveryQueries.mockResolvedValueOnce([]);
        TasteProfile.findOne
            .mockResolvedValueOnce({
                owner: 'u1',
                context: 'ctx',
                genreScores: new Map([['18', 10]]),
                keywordScores: new Map()
            })
            .mockResolvedValueOnce(null);
        UserAccount.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({
            userId: 'u1',
            apiKeys: { mistral: 'm-key' },
            addonUuid: 'uuid-missing'
        }) });
        AddonConfig.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
        tmdbGet.mockResolvedValue({ data: { results: [] } });

        await buildTopGenresMixCatalog('u1', 'ctx', 'tmdb-key', 'movie');

        expect(generateDiscoveryQueries).toHaveBeenCalledWith(
            expect.any(Object),
            'm-key',
            'trueBlend',
            expect.objectContaining({ apiKeys: { mistral: 'm-key' }, profiles: [] }),
            'ctx'
        );
    });

    it('resolveAiQueryToTmdbParams preserves AND separator when resolving keywords', async () => {
        tmdb.getTmdbIdByName
            .mockResolvedValueOnce(111)
            .mockResolvedValueOnce(222);

        const params = await resolveAiQueryToTmdbParams(
            { genre_ids: [18], keyword: 'slow burn,psychological' },
            'tmdb-key',
            'movie'
        );

        expect(params.with_genres).toBe('18');
        expect(params.with_keywords).toBe('111,222');
    });

    it('buildHiddenGemsCatalog passes a hidden-gems context into Tier 1 scoring', async () => {
        const ProfileScorer = require('../src/profile/ProfileScorer');
        TasteProfile.findOne
            .mockResolvedValueOnce({
                owner: 'u1',
                context: 'ctx',
                genreScores: new Map([['18', 10]]),
                keywordScores: new Map()
            })
            .mockResolvedValueOnce(null);
        UserAccount.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({
            userId: 'u1',
            apiKeys: {},
            addonUuid: 'uuid-2'
        }) });
        AddonConfig.findOne
            .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ uuid: 'uuid-2', profiles: [{ id: 'ctx', settings: {} }] }) });
        tmdbGet.mockResolvedValue({ data: { results: [{ id: 1, genre_ids: [18], vote_average: 7.5, vote_count: 120 }] } });

        await buildHiddenGemsCatalog('u1', 'ctx', 'tmdb-key', 'movie');

        expect(ProfileScorer.calculateLightScore).toHaveBeenCalledWith(
            expect.objectContaining({ id: 1, vote_count: 120 }),
            expect.any(Object),
            expect.objectContaining({ catalogContext: 'hidden_gems', types: 'movie' })
        );
    });
});
