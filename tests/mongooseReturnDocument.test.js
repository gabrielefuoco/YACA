jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'generated_user_id')
}));

jest.mock('../src/models/User', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn()
}));

jest.mock('../src/models/CacheEntry', () => ({
    findOneAndUpdate: jest.fn()
}));

const User = require('../src/models/User');
const CacheEntry = require('../src/models/CacheEntry');
const UserConfig = require('../src/models/UserConfig');
const CacheManager = require('../src/cache/CacheManager');

describe('Mongoose findOneAndUpdate options', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('uses returnDocument: after in UserConfig.saveUser', async () => {
        User.findOneAndUpdate.mockResolvedValueOnce({ userId: 'generated_user_id' });

        await UserConfig.saveUser({ apiKeys: { tmdb: 'k' } });

        expect(User.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: 'generated_user_id' },
            expect.objectContaining({
                $set: expect.objectContaining({ userId: 'generated_user_id' })
            }),
            expect.objectContaining({ returnDocument: 'after' })
        );
    });

    it('updates strictly by provided userId', async () => {
        User.findOne.mockResolvedValueOnce({ userId: 'existing_user', apiKeys: {} });
        User.findOneAndUpdate.mockResolvedValueOnce({ userId: 'existing_user' });

        await UserConfig.saveUser({ userId: 'existing_user', apiKeys: { tmdb: 'k', stremio: 'stremio_key' } });

        expect(User.findOne).toHaveBeenCalledWith({ userId: 'existing_user' });
        expect(User.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: 'existing_user' },
            expect.objectContaining({ $set: expect.objectContaining({ userId: 'existing_user' }) }),
            expect.objectContaining({ returnDocument: 'after' })
        );
    });

    it('uses returnDocument: after in CacheManager.set', async () => {
        CacheEntry.findOneAndUpdate.mockResolvedValueOnce({});
        const cache = new CacheManager('test_namespace');

        await cache.set('k', { value: 1 });

        expect(CacheEntry.findOneAndUpdate).toHaveBeenCalledWith(
            { namespace: 'test_namespace', key: 'k' },
            expect.any(Object),
            expect.objectContaining({ upsert: true, returnDocument: 'after' })
        );
    });

    it('preserves api key when omitted and removes it when explicitly null', async () => {
        User.findOne.mockResolvedValueOnce({
            userId: 'existing_user',
            apiKeys: { mistral: 'old_mistral', tmdb: 'old_tmdb' },
            config: {}
        });
        User.findOneAndUpdate.mockResolvedValueOnce({ userId: 'existing_user' });

        await UserConfig.saveUser({ userId: 'existing_user', apiKeys: { mistral: undefined, tmdb: null } });

        expect(User.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: 'existing_user' },
            expect.objectContaining({
                $set: expect.objectContaining({
                    apiKeys: expect.objectContaining({
                        mistral: 'old_mistral',
                        tmdb: null
                    })
                }),
                $unset: expect.objectContaining({ 'apiKeys.tmdb': 1 })
            }),
            expect.objectContaining({ returnDocument: 'after' })
        );
    });

    it('uses returnDocument: after in configure user list upsert', async () => {
        jest.resetModules();

        const userListFindOneAndUpdate = jest.fn().mockResolvedValueOnce({});
        const buildConfig = jest.fn().mockReturnValue({
            config: {},
            configBase64: 'abc123',
            configVersion: 'v1'
        });
        const saveUser = jest.fn().mockResolvedValueOnce({ userId: 'generated_user_id' });
        const generateTmdbFiltersFromPrompt = jest.fn().mockResolvedValueOnce({ target: 'tmdb' });

        jest.doMock('../src/models/UserList', () => ({
            findOneAndUpdate: userListFindOneAndUpdate,
            deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 })
        }));
        jest.doMock('../src/models/UserConfig', () => ({
            buildConfig,
            saveUser,
            getUser: jest.fn().mockResolvedValue({ userId: 'generated_user_id', apiKeys: {} })
        }));
        jest.doMock('../src/ai/router', () => ({
            generateTmdbFiltersFromPrompt
        }));
        jest.doMock('../src/data/presets', () => ({
            getPresets: () => []
        }));

        const configureRoute = require('../src/api/configure');
        const req = {
            get: jest.fn(() => 'localhost:7000'),
            user: { userId: 'generated_user_id', email: 'user@example.com' },
            body: {
                tmdbKey: 'tmdb_key',
                mistralKey: 'mistral_key',
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Profilo',
                    selectedPresets: [],
                    existingCatalogs: [],
                    newPrompts: ['film sci-fi'],
                    settings: {}
                }]
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        expect(userListFindOneAndUpdate).toHaveBeenCalled();
        expect(userListFindOneAndUpdate.mock.calls[0][2]).toEqual(
            expect.objectContaining({ upsert: true, returnDocument: 'after' })
        );
    });
});
