function findRouteHandler(router, method, path) {
    const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods?.[method]);
    if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
    return layer.route.stack[0].handle;
}

function createMockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe('profiles API route fixes (DNA refresh + AI logs)', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('initializes syncStatus before starting background refresh', async () => {
        const mockSyncAllStremioData = jest.fn().mockResolvedValue({ success: true });
        const mockUserFindOne = jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                userId: 'u1',
                apiKeys: { stremio: 'stremio-key' }
            })
        });
        const mockTasteUpdateOne = jest.fn().mockResolvedValue({ acknowledged: true });

        jest.doMock('../src/utils/stremioSync', () => ({
            syncAllStremioData: mockSyncAllStremioData
        }));
        jest.doMock('../src/db/models/UserAccount', () => ({
            findOne: mockUserFindOne
        }));
        jest.doMock('../src/models/TasteProfile', () => ({
            findOne: jest.fn(),
            updateOne: mockTasteUpdateOne
        }));
        jest.doMock('../src/db/models/AddonConfig', () => ({
            findOne: jest.fn(),
            updateOne: jest.fn()
        }));
        jest.doMock('../src/cache/cacheInstances', () => ({
            aiDiscoveryCache: { get: jest.fn() }
        }));
        jest.doMock('../src/ai/querySynthesizer', () => ({
            buildDnaDescription: jest.fn(),
            generateDiscoveryQueries: jest.fn()
        }));

        const router = require('../src/api/profiles');
        const refreshHandler = findRouteHandler(router, 'post', '/:id/sync/refresh');
        const req = { params: { id: 'anime' }, body: { userId: 'u1' } };
        const res = createMockRes();

        await refreshHandler(req, res);

        expect(mockTasteUpdateOne).toHaveBeenCalledWith(
            { owner: 'u1', context: 'anime' },
            {
                $set: {
                    'syncStatus.isSyncing': true,
                    'syncStatus.total': 1,
                    'syncStatus.current': 0
                }
            },
            { upsert: true }
        );
        expect(mockSyncAllStremioData).toHaveBeenCalledWith('u1', 'stremio-key', 'anime');
        expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Sync started for profile anime' });
    });

    it('generates AI logs on cache miss for hero AI catalogs', async () => {
        const mockBuildDnaDescription = jest.fn().mockReturnValue('manual dna profile');
        const mockGenerateDiscoveryQueries = jest
            .fn()
            .mockImplementation(async (_profile, _key, mode) => (mode === 'trueBlend' ? [{ vibe: 'blend' }] : [{ vibe: 'gems' }]));
        const mockCacheGet = jest.fn().mockResolvedValue(null);

        jest.doMock('../src/utils/stremioSync', () => ({
            syncAllStremioData: jest.fn()
        }));
        jest.doMock('../src/cache/cacheInstances', () => ({
            aiDiscoveryCache: { get: mockCacheGet }
        }));
        jest.doMock('../src/ai/querySynthesizer', () => ({
            buildDnaDescription: mockBuildDnaDescription,
            generateDiscoveryQueries: mockGenerateDiscoveryQueries
        }));
        jest.doMock('../src/db/models/UserAccount', () => ({
            findOne: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    userId: 'u1',
                    addonUuid: 'uuid-1',
                    apiKeys: { mistral: 'mistral-key' }
                })
            })
        }));
        jest.doMock('../src/db/models/AddonConfig', () => ({
            findOne: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    uuid: 'uuid-1',
                    profiles: [{ id: 'anime', settings: { manualDNA: [{ type: 'genre', id: '28', name: 'Action' }] } }]
                })
            }),
            updateOne: jest.fn()
        }));
        jest.doMock('../src/models/TasteProfile', () => ({
            findOne: jest.fn().mockResolvedValue(null),
            updateOne: jest.fn()
        }));

        const router = require('../src/api/profiles');
        const analyticsHandler = findRouteHandler(router, 'get', '/:id/analytics');
        const req = { params: { id: 'anime' }, query: { userId: 'u1' } };
        const res = createMockRes();

        await analyticsHandler(req, res);

        expect(mockBuildDnaDescription).toHaveBeenCalled();
        expect(mockGenerateDiscoveryQueries).toHaveBeenCalledTimes(2);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            aiLogs: expect.objectContaining({
                yaca_true_blend_movies: [{ vibe: 'blend' }],
                yaca_true_blend_series: [{ vibe: 'blend' }],
                yaca_hidden_gems_movies: [{ vibe: 'gems' }],
                yaca_hidden_gems_series: [{ vibe: 'gems' }]
            })
        }));
    });

    it('skips AI generation when mistral key is missing', async () => {
        const mockBuildDnaDescription = jest.fn().mockReturnValue('manual dna profile');
        const mockGenerateDiscoveryQueries = jest.fn();
        const mockCacheGet = jest.fn().mockResolvedValue(null);

        jest.doMock('../src/utils/stremioSync', () => ({
            syncAllStremioData: jest.fn()
        }));
        jest.doMock('../src/cache/cacheInstances', () => ({
            aiDiscoveryCache: { get: mockCacheGet }
        }));
        jest.doMock('../src/ai/querySynthesizer', () => ({
            buildDnaDescription: mockBuildDnaDescription,
            generateDiscoveryQueries: mockGenerateDiscoveryQueries
        }));
        jest.doMock('../src/db/models/UserAccount', () => ({
            findOne: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    userId: 'u1',
                    addonUuid: 'uuid-1',
                    apiKeys: {}
                })
            })
        }));
        jest.doMock('../src/db/models/AddonConfig', () => ({
            findOne: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    uuid: 'uuid-1',
                    profiles: [{ id: 'anime', settings: { manualDNA: [{ type: 'genre', id: '28', name: 'Action' }] } }]
                })
            }),
            updateOne: jest.fn()
        }));
        jest.doMock('../src/models/TasteProfile', () => ({
            findOne: jest.fn().mockResolvedValue(null),
            updateOne: jest.fn()
        }));

        const router = require('../src/api/profiles');
        const analyticsHandler = findRouteHandler(router, 'get', '/:id/analytics');
        const req = { params: { id: 'anime' }, query: { userId: 'u1' } };
        const res = createMockRes();

        await analyticsHandler(req, res);

        expect(mockBuildDnaDescription).toHaveBeenCalled();
        expect(mockGenerateDiscoveryQueries).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            aiLogs: expect.objectContaining({
                yaca_true_blend_movies: [],
                yaca_true_blend_series: [],
                yaca_hidden_gems_movies: [],
                yaca_hidden_gems_series: []
            })
        }));
    });

    it('returns baseDnaParams with OR joined ids from manual and suggested DNA', async () => {
        jest.doMock('../src/utils/stremioSync', () => ({
            syncAllStremioData: jest.fn()
        }));
        jest.doMock('../src/cache/cacheInstances', () => ({
            aiDiscoveryCache: { get: jest.fn() }
        }));
        jest.doMock('../src/ai/querySynthesizer', () => ({
            buildDnaDescription: jest.fn().mockReturnValue(null),
            generateDiscoveryQueries: jest.fn()
        }));
        jest.doMock('../src/db/models/UserAccount', () => ({
            findOne: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    userId: 'u1',
                    addonUuid: 'uuid-1',
                    apiKeys: {}
                })
            })
        }));
        jest.doMock('../src/db/models/AddonConfig', () => ({
            findOne: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    uuid: 'uuid-1',
                    profiles: [{
                        id: 'anime',
                        settings: {
                            manualDNA: [
                                { type: 'genre', id: '28', name: 'Action' },
                                { type: 'country', id: 'US', name: 'United States' }
                            ],
                            suggestedDNA: [
                                { type: 'genre', id: '878', name: 'Sci-Fi' },
                                { type: 'keyword', id: '1234', name: 'Cyberpunk' }
                            ]
                        }
                    }]
                })
            }),
            updateOne: jest.fn()
        }));
        jest.doMock('../src/models/TasteProfile', () => ({
            findOne: jest.fn().mockResolvedValue(null),
            updateOne: jest.fn()
        }));

        const router = require('../src/api/profiles');
        const analyticsHandler = findRouteHandler(router, 'get', '/:id/analytics');
        const req = { params: { id: 'anime' }, query: { userId: 'u1' } };
        const res = createMockRes();

        await analyticsHandler(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            baseDnaParams: {
                with_genres: '28|878',
                with_keywords: '1234',
                with_origin_country: 'US'
            }
        }));
    });

    it('returns empty baseDnaParams when DNA is missing', async () => {
        jest.doMock('../src/utils/stremioSync', () => ({
            syncAllStremioData: jest.fn()
        }));
        jest.doMock('../src/cache/cacheInstances', () => ({
            aiDiscoveryCache: { get: jest.fn() }
        }));
        jest.doMock('../src/ai/querySynthesizer', () => ({
            buildDnaDescription: jest.fn().mockReturnValue(null),
            generateDiscoveryQueries: jest.fn()
        }));
        jest.doMock('../src/db/models/UserAccount', () => ({
            findOne: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    userId: 'u1',
                    addonUuid: 'uuid-1',
                    apiKeys: {}
                })
            })
        }));
        jest.doMock('../src/db/models/AddonConfig', () => ({
            findOne: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    uuid: 'uuid-1',
                    profiles: [{ id: 'anime', settings: {} }]
                })
            }),
            updateOne: jest.fn()
        }));
        jest.doMock('../src/models/TasteProfile', () => ({
            findOne: jest.fn().mockResolvedValue(null),
            updateOne: jest.fn()
        }));

        const router = require('../src/api/profiles');
        const analyticsHandler = findRouteHandler(router, 'get', '/:id/analytics');
        const req = { params: { id: 'anime' }, query: { userId: 'u1' } };
        const res = createMockRes();

        await analyticsHandler(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            baseDnaParams: {}
        }));
    });
});
