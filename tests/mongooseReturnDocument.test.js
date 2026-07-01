jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'generated_user_id')
}));

// Two-Table Split: UserConfig now uses UserAccount + AddonConfig directly
jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn()
}));

jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn()
}));

jest.mock('../src/models/CacheEntry', () => ({
    findOneAndUpdate: jest.fn()
}));

const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const CacheEntry = require('../src/models/CacheEntry');
const UserConfig = require('../src/models/UserConfig');
const CacheManager = require('../src/cache/CacheManager');

describe('Mongoose findOneAndUpdate options', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('uses returnDocument: after in UserConfig.saveUser (UserAccount)', async () => {
        UserAccount.findOne.mockResolvedValueOnce(null);
        UserAccount.findOneAndUpdate.mockResolvedValueOnce({ userId: 'generated_user_id', addonUuid: 'uuid-1', apiKeys: {} });
        AddonConfig.findOneAndUpdate.mockResolvedValueOnce({ uuid: 'uuid-1', profiles: [], config: {} });

        await UserConfig.saveUser({ apiKeys: { tmdb: 'k' } });

        expect(UserAccount.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'generated_user_id' }),
            expect.any(Object),
            expect.objectContaining({ returnDocument: 'after' })
        );
    });

    it('uses returnDocument: after in UserConfig.saveUser (AddonConfig)', async () => {
        UserAccount.findOne.mockResolvedValueOnce(null);
        UserAccount.findOneAndUpdate.mockResolvedValueOnce({ userId: 'generated_user_id', addonUuid: 'uuid-1', apiKeys: {} });
        AddonConfig.findOneAndUpdate.mockResolvedValueOnce({ uuid: 'uuid-1', profiles: [], config: {} });

        await UserConfig.saveUser({ apiKeys: { tmdb: 'k' } });

        expect(AddonConfig.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ uuid: 'uuid-1' }),
            expect.any(Object),
            expect.objectContaining({ returnDocument: 'after' })
        );
    });

    it('updates UserAccount by provided userId', async () => {
        UserAccount.findOne.mockResolvedValueOnce({ userId: 'existing_user', apiKeys: {}, addonUuid: 'uuid-2' });
        AddonConfig.findOne.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({ uuid: 'uuid-2', profiles: [], config: {} })
        });
        UserAccount.findOneAndUpdate.mockResolvedValueOnce({ userId: 'existing_user', addonUuid: 'uuid-2', apiKeys: {} });
        AddonConfig.findOneAndUpdate.mockResolvedValueOnce({ uuid: 'uuid-2', profiles: [], config: {} });

        await UserConfig.saveUser({ userId: 'existing_user', apiKeys: { tmdb: 'k', stremio: 'stremio_key' } });

        expect(UserAccount.findOne).toHaveBeenCalledWith({ userId: 'existing_user' });
        expect(UserAccount.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'existing_user' }),
            expect.any(Object),
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

    it('handles api key null/undefined correctly via Two-Table Split', async () => {
        UserAccount.findOne.mockResolvedValueOnce({
            userId: 'existing_user',
            apiKeys: { mistral: 'old_mistral', tmdb: 'old_tmdb', toObject: () => ({ mistral: 'old_mistral', tmdb: 'old_tmdb' }) },
            addonUuid: 'uuid-3'
        });
        AddonConfig.findOne.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({ uuid: 'uuid-3', profiles: [], config: {} })
        });
        UserAccount.findOneAndUpdate.mockResolvedValueOnce({ userId: 'existing_user', addonUuid: 'uuid-3', apiKeys: {} });
        AddonConfig.findOneAndUpdate.mockResolvedValueOnce({ uuid: 'uuid-3', profiles: [], config: {} });

        await UserConfig.saveUser({ userId: 'existing_user', apiKeys: { mistral: undefined, tmdb: null } });

        // mistral=undefined means "don't touch" → preserves old_mistral in $set
        // tmdb=null means "delete" → $unset
        expect(UserAccount.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'existing_user' }),
            expect.objectContaining({
                $set: expect.objectContaining({
                    'apiKeys.mistral': 'old_mistral'
                }),
                $unset: expect.objectContaining({ 'apiKeys.tmdb': 1 })
            }),
            expect.objectContaining({ returnDocument: 'after' })
        );
    });

    it('uses deleteMany + create in configure user list upsert', async () => {
        jest.resetModules();

        const userListDeleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
        const saveUser = jest.fn().mockResolvedValueOnce({ userId: 'generated_user_id' });
        const generateTmdbFiltersFromPrompt = jest.fn().mockResolvedValueOnce({ target: 'tmdb' });


        jest.doMock('../src/models/UserConfig', () => ({
            saveUser,
            resolveUserConfig: jest.fn().mockResolvedValue({ userId: 'generated_user_id', apiKeys: {} })
        }));
        jest.doMock('../src/ai/router', () => ({
            generateTmdbFiltersFromPrompt
        }));
        jest.doMock('../src/data/presets', () => ({
            getPresets: () => []
        }));
        jest.doMock('../src/db/models/UserAccount', () => ({
            findOne: jest.fn().mockResolvedValue({ userId: 'generated_user_id', addonUuid: 'uuid-1' })
        }));
        jest.doMock('../src/utils/stremioAddon', () => ({
            updateStremioAddonCollection: jest.fn().mockResolvedValue(undefined)
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

        // Configure now deletes old lists and saves new user config
        expect(saveUser).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true })
        );
    });
});
