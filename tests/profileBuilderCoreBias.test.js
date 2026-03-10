jest.mock('../src/db/models/TasteProfile', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true })
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMovieDetails: jest.fn()
}));

jest.mock('../src/id_mapping/id_cache', () => ({
    translateImdbToTmdb: jest.fn()
}));

jest.mock('../src/db/models/User', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn().mockResolvedValue({ acknowledged: true })
}));

const TasteProfile = require('../src/db/models/TasteProfile');
const tmdb = require('../src/clients/tmdb');
const User = require('../src/db/models/User');
const { translateImdbToTmdb } = require('../src/id_mapping/id_cache');
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
        processedStremioIds: [],
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
        TasteProfile.findOneAndUpdate
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

    it('stages inferred DNA into pending suggestions for the matching profile', async () => {
        const globalProfile = createTasteProfile('global');
        globalProfile.genreScores.set('16', 120);
        globalProfile.keywordScores.set('210024', 80);
        User.findOne.mockResolvedValue({
            userId: 'user_1',
            profiles: [{
                id: 'global',
                settings: {
                    manualDNA: [],
                    suggestedDNA: [],
                    pendingDNASuggestions: []
                }
            }]
        });

        await ProfileBuilder.inferDNAFromProfile(globalProfile);

        expect(User.findOne).toHaveBeenCalled();
        expect(User.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: 'user_1', 'profiles.id': 'global' },
            {
                $set: {
                    'profiles.$.settings.pendingDNASuggestions': expect.arrayContaining([
                        expect.objectContaining({ type: 'genre', id: '16' }),
                        expect.objectContaining({ type: 'keyword', id: '210024' })
                    ])
                }
            }
        );
    });

    it('processes imdb-only trakt items by translating to tmdb', async () => {
        const profile = createTasteProfile('global');
        TasteProfile.findOneAndUpdate.mockResolvedValueOnce(profile);
        translateImdbToTmdb.mockResolvedValueOnce({ id: 'tmdb:777', type: 'movie' });
        tmdb.getTmdbMovieDetails.mockResolvedValueOnce({
            id: 777,
            genres: [{ id: 18 }],
            keywords: { results: [] },
            credits: { crew: [], cast: [] },
            production_companies: [],
            runtime: 100,
            release_date: '2010-01-01'
        });

        await ProfileBuilder.syncUserHistory(
            'user_1',
            'global',
            [{ movie: { ids: { imdb: 'tt1234567' } }, watched_at: '2026-01-01T00:00:00Z' }],
            'tmdb_key'
        );

        expect(translateImdbToTmdb).toHaveBeenCalledWith('tt1234567', 'tmdb_key');
        expect(tmdb.getTmdbMovieDetails).toHaveBeenCalledWith('tmdb_key', 'tmdb:777', 'movie');
        expect(profile.processedTraktIds).toContain('tt1234567');
    });

    it('stores trakt ids atomically after saving the profile document', async () => {
        const profile = createTasteProfile('global');
        TasteProfile.findOneAndUpdate.mockResolvedValueOnce(profile);
        tmdb.getTmdbMovieDetails.mockResolvedValueOnce({
            id: 888,
            genres: [{ id: 18 }],
            keywords: { results: [] },
            credits: { crew: [], cast: [] },
            production_companies: [],
            runtime: 100,
            release_date: '2010-01-01'
        });

        await ProfileBuilder.syncUserHistory(
            'user_1',
            'global',
            [{ movie: { ids: { tmdb: 888 } }, watched_at: '2026-01-01T00:00:00Z' }],
            'tmdb_key'
        );

        expect(profile.save).toHaveBeenCalled();
        expect(TasteProfile.updateOne).toHaveBeenCalledWith(
            { owner: 'user_1', context: 'global' },
            { $addToSet: { processedTraktIds: { $each: ['888'] } } }
        );
    });
});
