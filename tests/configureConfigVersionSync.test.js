jest.mock('../src/models/UserConfig', () => ({
    resolveUserConfig: jest.fn(),
    saveUser: jest.fn()
}));
jest.mock('../src/api/configure/profileProcessor', () => ({
    processProfiles: jest.fn(),
    createGlobalProfileInput: jest.fn(() => ({ id: 'global' }))
}));
jest.mock('../src/utils/stremioAddon', () => ({
    updateStremioAddonCollection: jest.fn()
}));

const configureRoute = require('../src/api/configure');
const UserConfig = require('../src/models/UserConfig');
const { updateStremioAddonCollection } = require('../src/utils/stremioAddon');

function makeRequest() {
    return {
        user: { userId: 'user-test', email: 'test@example.invalid' },
        context: { hostUrl: 'http://127.0.0.1:7035' },
        body: {},
        protocol: 'http',
        get: jest.fn(() => '127.0.0.1:7035')
    };
}

function makeResponse() {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    };
    return res;
}

describe('configure configVersion Stremio sync', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.TMDB_API_KEY = 'offline-test-key';
        updateStremioAddonCollection.mockResolvedValue({ success: true });
    });

    afterAll(() => {
        delete process.env.TMDB_API_KEY;
    });

    it('passes the newly persisted versioned manifest URL to Stremio', async () => {
        UserConfig.resolveUserConfig.mockResolvedValue({
            userId: 'user-test',
            configVersion: 'old-version',
            apiKeys: { stremio: 'auth-key' }
        });
        UserConfig.saveUser.mockResolvedValue({
            userId: 'user-test',
            apiKeys: { stremio: 'auth-key' },
            config: {
                activeProfileId: 'global',
                configVersion: 'new-version',
                manifestFingerprint: 'new-fingerprint'
            }
        });
        const req = makeRequest();
        const res = makeResponse();

        await configureRoute(req, res);

        expect(updateStremioAddonCollection).toHaveBeenCalledWith(
            'auth-key',
            'http://127.0.0.1:7035/user-test/new-version/manifest.json'
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            configVersion: 'new-version',
            manifestUrl: 'http://127.0.0.1:7035/user-test/new-version/manifest.json'
        }));
    });

    it('does not resync an unchanged manifest URL', async () => {
        UserConfig.resolveUserConfig.mockResolvedValue({
            userId: 'user-test',
            configVersion: 'same-version',
            apiKeys: { stremio: 'auth-key' }
        });
        UserConfig.saveUser.mockResolvedValue({
            userId: 'user-test',
            apiKeys: { stremio: 'auth-key' },
            config: {
                activeProfileId: 'global',
                configVersion: 'same-version',
                manifestFingerprint: 'same-fingerprint'
            }
        });
        const res = makeResponse();

        await configureRoute(makeRequest(), res);

        expect(updateStremioAddonCollection).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            configVersion: 'same-version',
            message: 'Configurazione salvata.'
        }));
    });

    it('still saves a new version when no Stremio auth key is available', async () => {
        UserConfig.resolveUserConfig.mockResolvedValue({
            userId: 'user-test',
            configVersion: 'old-version',
            apiKeys: {}
        });
        UserConfig.saveUser.mockResolvedValue({
            userId: 'user-test',
            apiKeys: {},
            config: { configVersion: 'new-version' }
        });
        const res = makeResponse();

        await configureRoute(makeRequest(), res);

        expect(UserConfig.saveUser).toHaveBeenCalledTimes(1);
        expect(updateStremioAddonCollection).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            configVersion: 'new-version'
        }));
    });
});
