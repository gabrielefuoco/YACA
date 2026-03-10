jest.mock('../src/db/models/TasteProfile', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/User', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/TmdbScoringData', () => ({
    find: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true })
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
    createTmdbClient: jest.fn()
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
}));

const TasteProfile = require('../src/db/models/TasteProfile');
const User = require('../src/db/models/User');
const TmdbScoringData = require('../src/db/models/TmdbScoringData');
const tmdb = require('../src/clients/tmdb');
const {
    resolveAiQueryToTmdbParams,
    twoTierScore,
    saveScoringData,
    buildHiddenGemsCatalog
} = require('../src/engines/hybridRecommendations');

describe('hybridRecommendations review fixes', () => {
    const tmdbGet = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
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
        User.findOne.mockResolvedValue({
            userId: 'u1',
            apiKeys: { mistral: 'm-key' },
            profiles: [{ id: 'ctx', settings: {} }]
        });

        await buildHiddenGemsCatalog('u1', 'ctx', 'tmdb-key', 'movie');

        const firstCallParams = tmdbGet.mock.calls[0][1].params;
        expect(firstCallParams.sort_by).toBe('vote_average.desc');
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

    it('twoTierScore uses lean() on TmdbScoringData.find and scores survivors', async () => {
        const lean = jest.fn().mockResolvedValue([
            {
                tmdbId: 2,
                genre_ids: [18],
                vote_average: 8,
                vote_count: 200,
                keyword_ids: [11],
                director_ids: [21],
                cast_ids: [31]
            },
            {
                tmdbId: 4,
                genre_ids: [28],
                vote_average: 9,
                vote_count: 300,
                keyword_ids: [12],
                director_ids: [22],
                cast_ids: [32]
            }
        ]);
        TmdbScoringData.find.mockReturnValue({ lean });

        const pool = [
            { id: 1, vote_average: 1, vote_count: 10, genre_ids: [18] },
            { id: 2, vote_average: 8, vote_count: 100, genre_ids: [18] },
            { id: 3, vote_average: 2, vote_count: 10, genre_ids: [18] },
            { id: 4, vote_average: 9, vote_count: 100, genre_ids: [28] }
        ];

        const result = await twoTierScore(pool, { genres: [] }, { tmdbApiKey: 'k', types: 'movie' });

        expect(TmdbScoringData.find).toHaveBeenCalledTimes(1);
        expect(lean).toHaveBeenCalledTimes(1);
        expect(result.length).toBe(2);
    });

    it('saveScoringData persists normalized scoring fields with upsert', async () => {
        await saveScoringData({
            id: 999,
            vote_average: 7.7,
            vote_count: 777,
            genres: [{ id: 18 }, { id: 53 }],
            keywords: { keywords: [{ id: 1001 }, { id: 1002 }] },
            credits: {
                crew: [{ id: 2001, job: 'Director' }, { id: 2002, job: 'Writer' }],
                cast: [{ id: 3001 }, { id: 3002 }, { id: 3003 }, { id: 3004 }, { id: 3005 }, { id: 3006 }]
            }
        }, 'movie');

        expect(TmdbScoringData.updateOne).toHaveBeenCalledWith(
            { tmdbId: 999, type: 'movie' },
            {
                $set: {
                    vote_average: 7.7,
                    vote_count: 777,
                    genre_ids: [18, 53],
                    keyword_ids: [1001, 1002],
                    director_ids: [2001],
                    cast_ids: [3001, 3002, 3003, 3004, 3005]
                }
            },
            { upsert: true }
        );
    });
});
