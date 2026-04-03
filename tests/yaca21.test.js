jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn()
}));
jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn(),
    updateOne: jest.fn()
}));
jest.mock('../src/clients/trakt', () => ({
    fetchTraktCatalog: jest.fn()
}));
jest.mock('../src/utils/mdblist', () => ({
    fetchMDBListItems: jest.fn(),
    parseMDBListItems: jest.fn()
}, { virtual: true });
jest.mock('../src/clients/tmdb', () => ({
    fetchTmdbCatalog: jest.fn(),
    createTmdbClient: jest.fn(),
    getTmdbIdByName: jest.fn(),
    getTmdbMovieDetails: jest.fn()
}));
jest.mock('../src/models/UserConfig', () => ({
    saveUser: jest.fn(),
    getUser: jest.fn().mockResolvedValue(null)
}));
jest.mock('nanoid', () => ({
    nanoid: () => 'mocked-id'
}));

const { buildDiscoveryParams } = require('../src/handlers/catalogHandler');
const configureHandler = require('../src/api/configure');
const { buildSuggestedDNAFromPresets } = configureHandler;
const ProfileBuilder = require('../src/profile/ProfileBuilder');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const config = require('../src/config');

describe('YACA 2.1 - Inclusive OR discovery params', () => {
    it('normalizes with_genres separators to pipes and preserves with_keywords separator logic', async () => {
        const params = await buildDiscoveryParams({
            with_genres: '35,18',
            with_keywords: '9840,123|456',
            sort_by: 'popularity.desc'
        }, 'tmdb-key', 'movie', {});

        expect(params.with_genres).toBe('35|18');
        // When with_keywords contains pipe (|), split by pipe preserving comma groups:
        // '9840,123|456' → split by | → ['9840,123', '456'] → join by | → '9840,123|456'
        // TMDB interprets this as (9840 AND 123) OR 456
        expect(params.with_keywords).toBe('9840,123|456');
    });

    it('builds mapped TV genres using OR pipes', async () => {
        const params = await buildDiscoveryParams({
            genre_ids: [28, 18]
        }, 'tmdb-key', 'series', {});

        expect(params.with_genres).toContain('|');
        expect(params.with_genres.split('|')).toEqual(expect.arrayContaining(['10759', '18']));
    });
});

describe('YACA 2.1 - cold start suggested DNA seeding', () => {
    it('extracts suggested DNA from selected preset filters', () => {
        const { getPresets } = require('../src/data/presets');
        const presets = getPresets();

        const seeded = buildSuggestedDNAFromPresets(
            ['preset_kdrama_romance', 'preset_kdrama_thriller'],
            presets
        );

        expect(seeded.some((item) => item.type === 'genre' && item.id === '35')).toBe(true);
        expect(seeded.some((item) => item.type === 'genre' && item.id === '18')).toBe(true);
        expect(seeded.some((item) => item.type === 'keyword' && item.id === '9840')).toBe(true);
    });
});

describe('YACA 2.1 - global profile DNA inference', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('propagates inferred DNA from global context to user profiles', async () => {
        const addonUuid = 'test-uuid';

        // Mock UserAccount.findOne with .lean() chain (used by _resolveAddonUuid)
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ addonUuid })
        });

        // Mock AddonConfig.findOne to return config with a 'global' profile
        AddonConfig.findOne.mockResolvedValue({
            profiles: [
                { id: 'global', settings: { manualDNA: [], suggestedDNA: [] } },
                { id: 'p2', settings: { manualDNA: [], suggestedDNA: [] } }
            ]
        });

        AddonConfig.updateOne.mockResolvedValue({});

        await ProfileBuilder.inferDNAFromProfile({
            owner: 'user_1',
            context: 'global',
            genreScores: new Map([['28', 80]]),
            keywordScores: new Map(),
            countryScores: new Map()
        });

        expect(AddonConfig.updateOne).toHaveBeenCalledWith(
            { uuid: addonUuid, 'profiles.id': 'global' },
            { $addToSet: { 'profiles.$.settings.suggestedDNA': { $each: expect.arrayContaining([
                expect.objectContaining({ type: 'genre', id: '28' })
            ]) } } }
        );
    });
});

describe('YACA 2.1 - enrichment tuning', () => {
    it('uses expanded enrichment budget and safe delay', () => {
        expect(config.ENRICHMENT_BUDGET).toBe(18);
        expect(config.ENRICHMENT_DELAY_MS).toBe(600);
    });
});
