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
        const accountFindOne = jest.fn(() => ({
            lean: jest.fn().mockResolvedValue({ userId: 'user-1', apiKeys: { tmdb: 'tmdb-key' }, addonUuid: 'uuid-1' })
        }));
        const addonFindOne = jest.fn(() => ({
            lean: jest.fn().mockResolvedValue({ uuid: 'uuid-1', profiles: [], config: {} })
        }));
        const addonFindOneAndUpdate = jest.fn().mockResolvedValue({});

        jest.doMock('../src/utils/httpClient', () => ({
            createAxiosInstance: jest.fn((baseUrl) => {
                if (baseUrl === 'https://likes.stremio.com') return { get: likesGet };
                return { post: stremioPost };
            })
        }));
        jest.doMock('../src/profile/ProfileBuilder', () => ({
            syncStremioData
        }));
        jest.doMock('../src/db/models/UserAccount', () => ({
            findOne: accountFindOne
        }));
        jest.doMock('../src/db/models/AddonConfig', () => ({
            findOne: addonFindOne,
            findOneAndUpdate: addonFindOneAndUpdate
        }));
        jest.doMock('../src/clients/trakt', () => ({
            fetchTraktCatalog: jest.fn(),
            syncTraktRatings: jest.fn(),
            syncTraktHistory: jest.fn()
        }));
        jest.doMock('../src/models/TasteProfile', () => ({
            findOne: jest.fn().mockResolvedValue(null)
        }));

        const { syncAllStremioData } = require('../src/utils/stremioSync');
        await syncAllStremioData('user-1', 'auth-key');

        expect(syncStremioData).toHaveBeenCalledWith('user-1', expect.any(Object), 'tmdb-key', 'global');
        expect(addonFindOneAndUpdate).toHaveBeenCalled();
    });
});

describe('redis pre-warm startup readiness', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('waits for Redis readiness before deciding to skip pre-warm', async () => {
        const set = jest.fn().mockResolvedValue('OK');
        const redis = { set };
        const lean = jest.fn().mockResolvedValue([{
            key: 'popular:movie:page:1',
            value: { metas: [] },
            expiresAt: new Date(Date.now() + 60_000)
        }]);
        const find = jest.fn().mockReturnValue({ lean });

        jest.doMock('../src/cache/redisClient', () => ({
            getRedisClient: jest.fn(() => redis),
            waitForRedisReady: jest.fn().mockResolvedValue(true),
            isRedisAvailable: jest.fn().mockReturnValue(true)
        }));
        jest.doMock('../src/models/CacheEntry', () => ({ find }));
        jest.doMock('../src/config', () => ({ PREWARM_PAGES: [1, 2], PREWARM_PRESET_IDS: [] }));

        const { preWarmRedisFromMongo } = require('../src/cache/preWarm');
        await preWarmRedisFromMongo();

        expect(find).toHaveBeenCalled();
        expect(set).toHaveBeenCalled();
    });

    it('skips pre-warm when Redis does not become ready in time', async () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const find = jest.fn();

        jest.doMock('../src/cache/redisClient', () => ({
            getRedisClient: jest.fn(() => ({ set: jest.fn() })),
            waitForRedisReady: jest.fn().mockResolvedValue(false),
            isRedisAvailable: jest.fn().mockReturnValue(false)
        }));
        jest.doMock('../src/models/CacheEntry', () => ({ find }));
        jest.doMock('../src/config', () => ({ PREWARM_PAGES: [1, 2], PREWARM_PRESET_IDS: [] }));

        const { preWarmRedisFromMongo } = require('../src/cache/preWarm');
        await preWarmRedisFromMongo();

        expect(find).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith('[PreWarm] Redis not available, skipping pre-warm.');
        logSpy.mockRestore();
    });
});
