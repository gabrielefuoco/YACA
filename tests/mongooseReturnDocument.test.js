jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'generated_user_id')
}));

jest.mock('../src/db/models/User', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    hashValue: jest.fn((v) => v ? `hash_${v}` : null)
}));

jest.mock('../src/db/models/CacheEntry', () => ({
    findOneAndUpdate: jest.fn()
}));

const User = require('../src/db/models/User');
const CacheEntry = require('../src/db/models/CacheEntry');
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
            { $set: expect.objectContaining({ userId: 'generated_user_id' }) },
            expect.objectContaining({ returnDocument: 'after' })
        );
    });

    it('reuses existing userId for duplicate stremio account', async () => {
        // stremioAuthHash lookup returns existing user (email lookup is skipped since no email provided)
        User.findOne
            .mockResolvedValueOnce({ userId: 'existing_user', apiKeys: {} }); // stremioAuthHash lookup
        User.findOneAndUpdate.mockResolvedValueOnce({ userId: 'existing_user' });

        await UserConfig.saveUser({ apiKeys: { tmdb: 'k', stremio: 'stremio_key' } });

        expect(User.findOne).toHaveBeenCalledWith({ stremioAuthHash: 'hash_stremio_key' });
        expect(User.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: 'existing_user' },
            { $set: expect.objectContaining({ userId: 'existing_user' }) },
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

    it('uses returnDocument: after in configure user list upsert', async () => {
        jest.resetModules();

        const userListFindOneAndUpdate = jest.fn().mockResolvedValueOnce({});
        const buildConfig = jest.fn().mockReturnValue({
            config: {},
            configBase64: 'abc123',
            configVersion: 'v1'
        });
        const saveUser = jest.fn().mockResolvedValueOnce({ user: { userId: 'generated_user_id' }, isNewUser: true });
        const generateTmdbFiltersFromPrompt = jest.fn().mockResolvedValueOnce({ target: 'tmdb' });

        jest.doMock('../src/db/models/UserList', () => ({
            findOneAndUpdate: userListFindOneAndUpdate
        }));
        jest.doMock('../src/models/UserConfig', () => ({
            buildConfig,
            saveUser
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
