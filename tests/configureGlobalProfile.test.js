jest.mock('../src/models/UserConfig', () => ({
    saveUser: jest.fn(),
    getUser: jest.fn().mockResolvedValue(null)
}));

jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'generated_id')
}));

jest.mock('../src/ai/router', () => ({
    generateTmdbFiltersFromPrompt: jest.fn()
}));

jest.mock('../src/db/models/UserList', () => ({
    findOneAndUpdate: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 })
}));

jest.mock('../src/data/presets', () => ({
    getPresets: () => [
        { id: 'preset_thriller', filters: { with_keywords: '111', with_genres: '53' } },
        { id: 'preset_docs', filters: { with_keywords: '222', with_genres: '99' } },
        { id: 'preset_mix', filters: { with_keywords: '111|333', with_genres: '53|18' } },
        { id: 'preset_anime_ai', filters: { genre_ids: [16, 28], keyword: 'zombie,samurai' } },
        { id: 'preset_ai_romance', filters: { genre_ids: [10749], keyword: 'love' } }
    ]
}));

const configureRoute = require('../src/api/configure');
const UserConfig = require('../src/models/UserConfig');

describe('configure route global profile safeguards', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, TMDB_API_KEY: 'tmdb_key' };
        UserConfig.saveUser.mockResolvedValue({ userId: 'u1' });
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('injects immutable global profile when missing', async () => {
        const req = {
            protocol: 'http',
            get: jest.fn(() => 'localhost:7000'),
            user: { userId: 'u1', email: 'user@example.com' },
            body: {
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Niche',
                    selectedPresets: ['preset_thriller'],
                    existingCatalogs: [],
                    newPrompts: [],
                    settings: { manualDNA: [{ id: '1', type: 'genre', name: 'Action' }] }
                }]
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        const payload = UserConfig.saveUser.mock.calls[0][0];
        const globalProfile = payload.profiles.find((p) => p.id === 'global');
        expect(globalProfile).toBeDefined();
        expect(globalProfile.name).toBe('Generale');
        expect(globalProfile.settings.manualDNA).toEqual([]);
        expect(globalProfile.settings.suggestedDNA).toEqual([]);
    });

    it('forces global profile name and manualDNA invariants', async () => {
        const req = {
            protocol: 'http',
            get: jest.fn(() => 'localhost:7000'),
            user: { userId: 'u1', email: 'user@example.com' },
            body: {
                activeProfileId: 'global',
                profiles: [{
                    id: 'global',
                    name: 'Hacked Name',
                    selectedPresets: ['preset_thriller'],
                    existingCatalogs: [],
                    newPrompts: [],
                    settings: { manualDNA: [{ id: '2', type: 'genre', name: 'Drama' }] }
                }]
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        const payload = UserConfig.saveUser.mock.calls[0][0];
        const globalProfile = payload.profiles.find((p) => p.id === 'global');
        expect(globalProfile.name).toBe('Generale');
        expect(globalProfile.settings.manualDNA).toEqual([]);
        expect(globalProfile.settings.suggestedDNA).toEqual([]);
        expect(payload.config.activeProfileId).toBe('global');
    });

    it('rebuilds suggestedDNA from active presets only', async () => {
        const req = {
            protocol: 'http',
            get: jest.fn(() => 'localhost:7000'),
            user: { userId: 'u1', email: 'user@example.com' },
            body: {
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Profilo',
                    selectedPresets: ['preset_docs'],
                    existingCatalogs: [],
                    newPrompts: [],
                    settings: {
                        manualDNA: [{ id: '99', type: 'genre', name: 'Genre 99' }],
                        suggestedDNA: [
                            { id: '53', type: 'genre', name: 'Genre 53' },
                            { id: '111', type: 'keyword', name: 'Keyword 111' }
                        ]
                    }
                }]
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        const payload = UserConfig.saveUser.mock.calls[0][0];
        const profile = payload.profiles.find((p) => p.id === 'p1');
        expect(profile.settings.suggestedDNA).toEqual([
            { id: '222', type: 'keyword', name: 'Keyword 222' }
        ]);
        expect(profile.settings.suggestedDNA.some((item) => item.type === 'genre' && item.id === '99')).toBe(false);
    });

    it('deduplicates suggestedDNA across multiple active presets', async () => {
        const req = {
            protocol: 'http',
            get: jest.fn(() => 'localhost:7000'),
            user: { userId: 'u1', email: 'user@example.com' },
            body: {
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Profilo',
                    selectedPresets: ['preset_thriller', 'preset_mix'],
                    existingCatalogs: [],
                    newPrompts: [],
                    settings: { manualDNA: [] }
                }]
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        const payload = UserConfig.saveUser.mock.calls[0][0];
        const profile = payload.profiles.find((p) => p.id === 'p1');
        expect(profile.settings.suggestedDNA).toEqual(expect.arrayContaining([
            { id: '53', type: 'genre', name: 'Thriller' },
            { id: '18', type: 'genre', name: 'Dramma' },
            { id: '111', type: 'keyword', name: 'Keyword 111' },
            { id: '333', type: 'keyword', name: 'Keyword 333' }
        ]));
        expect(profile.settings.suggestedDNA).toHaveLength(4);
    });

    it('extracts DNA from genre_ids arrays and keyword fields (AI filters)', async () => {
        const req = {
            protocol: 'http',
            get: jest.fn(() => 'localhost:7000'),
            user: { userId: 'u1', email: 'user@example.com' },
            body: {
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Anime Profile',
                    selectedPresets: ['preset_anime_ai'],
                    existingCatalogs: [],
                    newPrompts: [],
                    settings: { manualDNA: [] }
                }]
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        const payload = UserConfig.saveUser.mock.calls[0][0];
        const profile = payload.profiles.find((p) => p.id === 'p1');
        expect(profile.settings.suggestedDNA).toEqual(expect.arrayContaining([
            { id: '16', type: 'genre', name: 'Animazione' },
            { id: '28', type: 'genre', name: 'Azione' },
            { id: 'zombie', type: 'keyword', name: 'Keyword zombie' },
            { id: 'samurai', type: 'keyword', name: 'Keyword samurai' }
        ]));
        expect(profile.settings.suggestedDNA).toHaveLength(4);
    });

    it('resolves known genre/keyword IDs to Italian names', async () => {
        const req = {
            protocol: 'http',
            get: jest.fn(() => 'localhost:7000'),
            user: { userId: 'u1', email: 'user@example.com' },
            body: {
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Name Test',
                    selectedPresets: ['preset_ai_romance'],
                    existingCatalogs: [],
                    newPrompts: [],
                    settings: { manualDNA: [] }
                }]
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        const payload = UserConfig.saveUser.mock.calls[0][0];
        const profile = payload.profiles.find((p) => p.id === 'p1');
        expect(profile.settings.suggestedDNA).toEqual(expect.arrayContaining([
            { id: '10749', type: 'genre', name: 'Romance' }
        ]));
        expect(profile.settings.suggestedDNA.some(d => d.name.startsWith('Genre '))).toBe(false);
    });
});
