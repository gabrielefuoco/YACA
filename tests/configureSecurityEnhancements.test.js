jest.mock('../src/models/UserConfig', () => ({
    saveUser: jest.fn().mockResolvedValue({ userId: 'jwt_user' }),
    resolveUserConfig: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/models/UserList', () => ({
    findOneAndUpdate: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 })
}));

jest.mock('../src/ai/router', () => ({
    generateTmdbFiltersFromPrompt: jest.fn()
}));

jest.mock('../src/data/presets', () => ({
    getPresets: () => []
}));

const configureRoute = require('../src/api/configure');
const UserConfig = require('../src/models/UserConfig');
const { generateTmdbFiltersFromPrompt } = require('../src/ai/router');

describe('configure security enhancements', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.TMDB_API_KEY = 'server_tmdb';
    });

    afterEach(() => {
        delete process.env.TMDB_API_KEY;
    });

    function baseReq(body = {}) {
        return {
            protocol: 'https',
            headers: {},
            get: jest.fn(() => 'localhost:7000'),
            user: { userId: 'jwt_user', email: 'jwt@example.com' },
            body: {
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Profilo',
                    selectedPresets: [],
                    existingCatalogs: [],
                    newPrompts: [],
                    settings: {}
                }],
                ...body
            }
        };
    }

    function mockRes() {
        const res = {};
        res.status = jest.fn().mockReturnValue(res);
        res.json = jest.fn().mockReturnValue(res);
        return res;
    }

    it('uses persisted mistral key when request omits mistralKey', async () => {
        UserConfig.resolveUserConfig.mockResolvedValueOnce({
            userId: 'jwt_user',
            email: 'jwt@example.com',
            apiKeys: { mistral: 'stored_mistral_key' }
        });
        generateTmdbFiltersFromPrompt.mockResolvedValueOnce({ strategy: 'multi_search', target: 'tmdb' });
        const req = baseReq({
            profiles: [{
                id: 'p1',
                name: 'Profilo',
                selectedPresets: [],
                existingCatalogs: [],
                newPrompts: ['film noir'],
                settings: {}
            }]
        });
        const res = mockRes();

        await configureRoute(req, res);

        expect(generateTmdbFiltersFromPrompt).toHaveBeenCalledWith('film noir', 'stored_mistral_key', false, 'multi_query');
        expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it('returns AI warnings when prompt generation fails', async () => {
        UserConfig.resolveUserConfig.mockResolvedValueOnce({
            userId: 'jwt_user',
            email: 'jwt@example.com',
            apiKeys: { mistral: 'stored_mistral_key' }
        });
        generateTmdbFiltersFromPrompt.mockRejectedValueOnce(new Error('policy blocked'));
        const req = baseReq({
            profiles: [{
                id: 'p1',
                name: 'Profilo',
                selectedPresets: [],
                existingCatalogs: [],
                newPrompts: ['prompt bloccato'],
                settings: {}
            }]
        });
        const res = mockRes();

        await configureRoute(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            warnings: expect.arrayContaining([
                expect.objectContaining({
                    type: 'ai_generation_failed',
                    profileId: 'p1'
                })
            ])
        }));
    });

    it('does not use traktUsername as token fallback', async () => {
        const req = baseReq({ traktUsername: 'username_only' });
        const res = mockRes();

        await configureRoute(req, res);

        expect(UserConfig.saveUser).toHaveBeenCalledWith(expect.objectContaining({
            apiKeys: expect.objectContaining({
                trakt: undefined
            })
        }));
    });

    it('rejects malformed trakt token payloads', async () => {
        const req = baseReq({ traktToken: 'short_token' });
        const res = mockRes();

        await configureRoute(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(UserConfig.saveUser).not.toHaveBeenCalled();
    });
});
