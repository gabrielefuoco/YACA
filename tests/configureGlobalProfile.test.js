jest.mock('../src/models/UserConfig', () => ({
    saveUser: jest.fn()
}));

jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'generated_id')
}));

jest.mock('../src/ai/router', () => ({
    generateTmdbFiltersFromPrompt: jest.fn()
}));

jest.mock('../src/data/presets', () => ({
    getPresets: () => [
        { id: 'preset_thriller', filters: { with_keywords: '111', with_genres: '53' } },
        { id: 'preset_docs', filters: { with_keywords: '222', with_genres: '99' } },
        { id: 'preset_mix', filters: { with_keywords: '111|333', with_genres: '53|18' } }
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
            { id: '53', type: 'genre', name: 'Genre 53' },
            { id: '18', type: 'genre', name: 'Genre 18' },
            { id: '111', type: 'keyword', name: 'Keyword 111' },
            { id: '333', type: 'keyword', name: 'Keyword 333' }
        ]));
        expect(profile.settings.suggestedDNA).toHaveLength(4);
    });
});
