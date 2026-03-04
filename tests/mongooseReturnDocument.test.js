jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'generated_user_id')
}));

jest.mock('../src/db/models/User', () => ({
    findOneAndUpdate: jest.fn()
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
            expect.objectContaining({ userId: 'generated_user_id' }),
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
});
