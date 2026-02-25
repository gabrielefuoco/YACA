jest.mock('../src/models/UserConfig', () => ({
    saveConfig: jest.fn(),
    findOne: jest.fn()
}));

jest.mock('uuid', () => ({
    v4: jest.fn(() => 'generated-uuid')
}));

jest.mock('../src/ai/router', () => ({
    generateTmdbFiltersFromPrompt: jest.fn()
}));

jest.mock('../src/data/presets', () => ({
    presets: []
}));

const configureRoute = require('../src/api/configure');
const UserConfig = require('../src/models/UserConfig');

describe('configure route - stremio auth persistence', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('saves stremio auth key and email into apiKeys', async () => {
        UserConfig.saveConfig.mockResolvedValue([{ uuid: 'u1' }]);
        UserConfig.findOne.mockResolvedValue({ uuid: 'u1', configVersion: 'cv1' });

        const req = {
            body: {
                uuid: 'u1',
                tmdbKey: 'tmdb_key',
                stremioAuthKey: 'stremio_auth_key',
                stremioEmail: 'user@example.com',
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Profilo',
                    selectedPresets: [],
                    existingCatalogs: [],
                    newPrompts: []
                }]
            }
        };

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await configureRoute(req, res);

        expect(UserConfig.saveConfig).toHaveBeenCalledWith(expect.objectContaining({
            apiKeys: expect.objectContaining({
                tmdb: 'tmdb_key',
                stremioAuthKey: 'stremio_auth_key',
                stremioEmail: 'user@example.com'
            })
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, uuid: 'u1' }));
    });
});
