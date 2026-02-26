jest.mock('../src/models/UserConfig', () => ({
    saveConfig: jest.fn(),
    findOne: jest.fn()
}));

jest.mock('uuid', () => ({
    v4: jest.fn(() => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')
}));

jest.mock('../src/ai/router', () => ({
    generateTmdbFiltersFromPrompt: jest.fn()
}));

jest.mock('../src/data/presets', () => ({
    getPresets: () => []
}));

const configureRoute = require('../src/api/configure');
const UserConfig = require('../src/models/UserConfig');

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('configure route - stremio auth persistence', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('saves stremio auth key and email into apiKeys', async () => {
        UserConfig.saveConfig.mockResolvedValue({ uuid: VALID_UUID, configVersion: 'cv1' });

        const req = {
            body: {
                uuid: VALID_UUID,
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

        expect(UserConfig.saveConfig).toHaveBeenCalledWith(expect.objectContaining({
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
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, uuid: VALID_UUID }));
    });
});
