jest.mock('../src/db/models/TasteProfile', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMovieDetails: jest.fn()
}));

jest.mock('../src/db/models/User', () => ({
    findOne: jest.fn()
}));

const TasteProfile = require('../src/db/models/TasteProfile');
const tmdb = require('../src/clients/tmdb');
const User = require('../src/db/models/User');
const ProfileBuilder = require('../src/profile/ProfileBuilder');

function createTasteProfile(context) {
    return {
        owner: 'user_1',
        context,
        genreScores: new Map(),
        keywordScores: new Map(),
        directorScores: new Map(),
        actorScores: new Map(),
        studioScores: new Map(),
        eraScores: new Map(),
        countryScores: new Map(),
        runtimeScores: new Map(),
        processedTraktIds: [],
        save: jest.fn().mockResolvedValue(undefined)
    };
}

describe('ProfileBuilder core taste bias', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        User.findOne.mockResolvedValue(null);
    });

    it('mirrors non-global history updates into global profile at 20%', async () => {
        const nicheProfile = createTasteProfile('anime');
        const globalProfile = createTasteProfile('global');

        TasteProfile.findOne
            .mockResolvedValueOnce(nicheProfile)
            .mockResolvedValueOnce(globalProfile);

        tmdb.getTmdbMovieDetails.mockResolvedValue({
            id: 100,
            genres: [{ id: 16 }],
            keywords: { results: [{ id: 900 }] },
            credits: { crew: [], cast: [] },
            production_companies: [],
            runtime: 100,
            release_date: '2024-01-01'
        });

        await ProfileBuilder.syncUserHistory(
            'user_1',
            'anime',
            [{ movie: { ids: { tmdb: 100 } }, watched_at: '2026-01-01T00:00:00Z' }],
            'tmdb_key'
        );

        const nicheGenreScore = nicheProfile.genreScores.get('16');
        const globalGenreScore = globalProfile.genreScores.get('16');

        expect(nicheGenreScore).toBeGreaterThan(0);
        expect(globalGenreScore).toBeGreaterThan(0);
        expect(globalGenreScore).toBeLessThan(nicheGenreScore);
    });

    it('does not infer suggestedDNA for global context', async () => {
        const globalProfile = createTasteProfile('global');
        await ProfileBuilder.inferDNAFromProfile(globalProfile);
        expect(User.findOne).not.toHaveBeenCalled();
    });
});
