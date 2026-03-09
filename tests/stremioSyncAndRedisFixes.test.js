describe('redis startup retry strategy', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('retries longer before giving up during startup', async () => {
        let redisOptions;
        const connect = jest.fn().mockRejectedValue(new Error('redis down'));
        jest.doMock('ioredis', () => jest.fn().mockImplementation((_url, options) => {
            redisOptions = options;
            return {
                on: jest.fn(),
                connect,
                quit: jest.fn().mockResolvedValue(undefined),
                status: 'end'
            };
        }));

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const { getRedisClient } = require('../src/cache/redisClient');
        getRedisClient();
        await Promise.resolve();

        expect(redisOptions.retryStrategy(1)).toBe(500);
        expect(redisOptions.retryStrategy(15)).toBe(2000);
        expect(redisOptions.retryStrategy(16)).toBeNull();
        warnSpy.mockRestore();
    });
});

describe('stremio sync builder invocation', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('calls ProfileBuilder.syncStremioData as static method with tmdb api key', async () => {
        const likesGet = jest.fn(async (url) => {
            if (url.startsWith('/getAddonKey')) return { data: 'addon-key' };
            return { data: { metas: [] } };
        });
        const stremioPost = jest.fn().mockResolvedValue({ data: { result: [] } });
        const syncStremioData = jest.fn().mockResolvedValue({});
        const findOne = jest.fn().mockResolvedValue({ apiKeys: { tmdb: 'tmdb-key' } });
        const findOneAndUpdate = jest.fn().mockResolvedValue({});

        jest.doMock('../src/utils/httpClient', () => ({
            createAxiosInstance: jest.fn((baseUrl) => {
                if (baseUrl === 'https://likes.stremio.com') return { get: likesGet };
                return { post: stremioPost };
            })
        }));
        jest.doMock('../src/profile/ProfileBuilder', () => ({
            syncStremioData
        }));
        jest.doMock('../src/db/models/User', () => ({
            findOne,
            findOneAndUpdate
        }));
        jest.doMock('../src/clients/trakt', () => ({
            fetchTraktCatalog: jest.fn(),
            syncTraktRatings: jest.fn(),
            syncTraktHistory: jest.fn()
        }));

        const { syncAllStremioData } = require('../src/utils/stremioSync');
        await syncAllStremioData('user-1', 'auth-key');

        expect(syncStremioData).toHaveBeenCalledWith('user-1', expect.any(Object), 'tmdb-key');
        expect(findOneAndUpdate).toHaveBeenCalled();
    });
});
