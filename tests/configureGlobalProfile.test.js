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
    getPresets: () => []
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
                    selectedPresets: [],
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
                    selectedPresets: [],
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
        expect(payload.config.activeProfileId).toBe('global');
    });
});
