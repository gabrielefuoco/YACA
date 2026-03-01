jest.mock('../src/models/UserConfig', () => ({
    buildConfig: jest.fn(),
    encodeConfig: jest.fn(),
    decodeConfig: jest.fn()
}));

jest.mock('../src/ai/router', () => ({
    generateTmdbFiltersFromPrompt: jest.fn()
}));

jest.mock('../src/data/presets', () => ({
    getPresets: () => []
}));

const configureRoute = require('../src/api/configure');
const UserConfig = require('../src/models/UserConfig');

describe('configure route - stremio auth persistence', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('saves stremio auth key and email into apiKeys', async () => {
        UserConfig.buildConfig.mockReturnValue({ config: {}, configBase64: 'abc123base64', configVersion: 'cv1' });

        const req = {
            body: {
                tmdbKey: 'tmdb_key',
                stremioAuthKey: 'stremio_auth_key',
                stremioEmail: 'user@example.com',
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Profilo',
                    selectedPresets: [],
                    existingCatalogs: [],
                    newPrompts: [],
                    settings: { minVoteAverage: 6, minVoteCount: 100, fastPresetRefresh: true }
                }]
            }
        };

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await configureRoute(req, res);

        expect(UserConfig.buildConfig).toHaveBeenCalledWith(expect.objectContaining({
            apiKeys: expect.objectContaining({
                tmdb: 'tmdb_key',
                stremioAuthKey: 'stremio_auth_key',
                stremioEmail: 'user@example.com'
            }),
            profiles: expect.arrayContaining([
                expect.objectContaining({
                    settings: expect.objectContaining({ fastPresetRefresh: true })
                })
            ])
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, configBase64: 'abc123base64' }));
    });
});
