jest.mock('../src/models/UserConfig', () => ({
    saveUser: jest.fn().mockResolvedValue({ userId: 'saved_user' }),
    getUser: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/db/models/UserList', () => ({
    deleteMany: jest.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 })
}));

jest.mock('../src/ai/router', () => ({
    generateTmdbFiltersFromPrompt: jest.fn()
}));

jest.mock('../src/data/presets', () => ({
    getPresets: () => []
}));

const configureRoute = require('../src/api/configure');
const UserConfig = require('../src/models/UserConfig');

describe('configure route auth userId precedence', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, TMDB_API_KEY: 'server_tmdb' };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('uses req.user.userId when JWT identity exists', async () => {
        const req = {
            protocol: 'http',
            get: jest.fn(() => 'localhost:7000'),
            user: { userId: 'jwt_user' },
            body: {
                userId: 'body_user',
                tmdbKey: 'personal_tmdb',
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Profilo',
                    selectedPresets: [],
                    existingCatalogs: [],
                    newPrompts: [],
                    settings: {}
                }]
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        expect(UserConfig.saveUser).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'jwt_user'
        }));
    });

    it('rejects configure calls when JWT identity is missing', async () => {
        const req = {
            protocol: 'http',
            get: jest.fn(() => 'localhost:7000'),
            body: {
                userId: 'body_user',
                tmdbKey: 'personal_tmdb',
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Profilo',
                    selectedPresets: [],
                    existingCatalogs: [],
                    newPrompts: [],
                    settings: {}
                }]
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        expect(UserConfig.saveUser).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });
});
