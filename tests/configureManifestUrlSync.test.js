jest.mock('../src/models/UserConfig', () => ({
    saveUser: jest.fn(),
    resolveUserConfig: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/models/UserList', () => ({
    deleteMany: jest.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 })
}));

jest.mock('../src/api/configure/profileProcessor', () => ({
    processProfiles: jest.fn(),
    createGlobalProfileInput: jest.fn(() => ({ id: 'global', name: 'Generale' }))
}));

jest.mock('../src/utils/stremioAddonSync', () => ({
    updateStremioAddonCollection: jest.fn().mockResolvedValue({ success: true })
}));

const configureRoute = require('../src/api/configure');
const UserConfig = require('../src/models/UserConfig');
const { updateStremioAddonCollection } = require('../src/utils/stremioAddonSync');

describe('configure route manifest sync URL', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, TMDB_API_KEY: 'tmdb_server_key' };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('builds stremio manifest URL without /api prefix', async () => {
        UserConfig.saveUser.mockResolvedValue({
            userId: 'user_123',
            config: { configVersion: 'cfg_456' },
            apiKeys: { stremio: 'stremio_key_789' }
        });

        const req = {
            protocol: 'http',
            get: jest.fn(() => 'localhost:7000'),
            headers: {},
            user: { userId: 'user_123' },
            body: {}
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        expect(updateStremioAddonCollection).toHaveBeenCalledWith(
            'stremio_key_789',
            'http://localhost:7000/user_123/cfg_456/manifest.json'
        );
    });
});
