jest.mock('../src/clients/tmdb', () => ({
    fetchTmdbCatalog: jest.fn(),
    createTmdbClient: jest.fn(() => ({})),
    getTmdbIdByName: jest.fn(),
    getTmdbMovieDetails: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/data/presets', () => ({
    getPresets: jest.fn(() => [])
}));

jest.mock('../src/models/UserList', () => ({
    findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) }))
}));

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/models/UserActivity', () => ({
    create: jest.fn().mockResolvedValue(null),
    find: jest.fn(() => ({ sort: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([]) })) }))
}));

jest.mock('../src/models/TmdbScoringData', () => ({
    find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) }))
}));

jest.mock('../src/models/CacheEntry', () => ({
    find: jest.fn(() => ({ limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })) }))
}));

jest.mock('../src/utils/rateLimiter', () => ({
    rateLimitedMap: jest.fn(async (items, fn) => Promise.all(items.map(fn)))
}));

const { fetchTmdbCatalog } = require('../src/clients/tmdb');
const { getPresets } = require('../src/data/presets');
const { catalogHandler } = require('../src/handlers/catalogHandler');

describe('merged catalogs fallback to mergedFrom sources', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('uses catalogMeta.mergedFrom when filters.merge.catalogs is empty', async () => {
        getPresets.mockReturnValue([
            { id: 'preset_a', type: 'movie', filters: { sort_by: 'vote_average.desc', 'vote_count.gte': 300 } },
            { id: 'preset_b', type: 'movie', filters: { sort_by: 'revenue.desc', 'vote_count.gte': 100 } }
        ]);

        fetchTmdbCatalog
            .mockResolvedValueOnce([{ id: 'tmdb:101', type: 'movie', name: 'From A', popularity: 100 }])
            .mockResolvedValueOnce([{ id: 'tmdb:202', type: 'movie', name: 'From B', popularity: 90 }]);

        const userConfig = {
            userId: 'user_1',
            activeProfileId: 'global',
            apiKeys: { tmdb: 'tmdb_key' },
            profiles: [{
                id: 'global',
                catalogs: [{
                    id: 'merged_catalog',
                    type: 'movie',
                    source: 'merged',
                    mergedFrom: ['preset_a', 'preset_b'],
                    filters: {
                        merge: {
                            catalogs: [],
                            sourceFilters: [null, null],
                            sourceTypes: ['movie', 'movie'],
                            strategy: 'popularity'
                        }
                    }
                }]
            }]
        };

        const response = await catalogHandler({
            type: 'movie',
            id: 'merged_catalog',
            extra: { skip: 0 }
        }, userConfig, 'https://host.test');

        expect(fetchTmdbCatalog).toHaveBeenCalledTimes(2);
        expect(response.metas.map(m => m.id)).toEqual(expect.arrayContaining(['tmdb:101', 'tmdb:202']));
    });
});
