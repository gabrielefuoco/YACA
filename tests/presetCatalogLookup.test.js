jest.mock('../src/clients/tmdb', () => ({
    fetchTmdbCatalog: jest.fn(),
    createTmdbClient: jest.fn(() => ({})),
    getTmdbIdByName: jest.fn()
}));

jest.mock('../src/clients/kitsu', () => ({
    fetchKitsuCatalog: jest.fn()
}));

jest.mock('../src/clients/trakt', () => ({
    fetchTraktCatalog: jest.fn()
}));

jest.mock('../src/utils/mdblist', () => ({
    fetchMDBListItems: jest.fn(),
    parseMDBListItems: jest.fn()
}, { virtual: true });

jest.mock('../src/ai/router', () => ({
    routeLiveStremioSearch: jest.fn()
}));

jest.mock('../src/models/UserConfig', () => ({
    decodeConfig: jest.fn(),
    encodeConfig: jest.fn(),
    buildConfig: jest.fn()
}));

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/models/UserActivity', () => ({
    create: jest.fn().mockResolvedValue(null),
    find: jest.fn(() => ({ sort: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([]) })) }))
}));

jest.mock('../src/models/UserList', () => ({
    findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) }))
}));

jest.mock('../src/models/CacheEntry', () => ({
    find: jest.fn(() => ({ limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })) }))
}));

jest.mock('../src/models/TmdbRequestCache', () => ({
    get: jest.fn().mockResolvedValue(null),
    getWithStatus: jest.fn().mockResolvedValue({ value: null, status: 'miss' }),
    set: jest.fn().mockResolvedValue(null)
}));

const { fetchTmdbCatalog } = require('../src/clients/tmdb');
const { catalogHandler } = require('../src/handlers/catalogHandler');

describe('catalogHandler preset catalog lookup', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should resolve filters from presets list for a yaca_preset_* catalog without embedded filters', async () => {
        // Catalog stored in profile has no filters - they must be resolved from getPresets()
        const userConfig = {
            apiKeys: { tmdb: 'tmdb_key' },
            profiles: [{
                id: 'prof_1',
                name: 'Test Profile',
                catalogs: [{ id: 'yaca_preset_preset_pop_movies', name: 'Film Popolari', type: 'movie' }]
            }],
            activeProfileId: 'prof_1'
        };

        const mockMeta = { id: 'tmdb:12345', type: 'movie', name: 'Test Movie' };
        fetchTmdbCatalog.mockResolvedValue([mockMeta]);

        const result = await catalogHandler({
            type: 'movie',
            id: 'yaca_preset_preset_pop_movies',
            extra: { skip: 0 }
        }, userConfig);

        // Should have called TMDB (not returned empty due to missing filters)
        expect(fetchTmdbCatalog).toHaveBeenCalled();
        expect(result.metas).toEqual([mockMeta]);
    });

    it('should return empty metas for unknown preset id', async () => {
        const userConfig = {
            apiKeys: { tmdb: 'tmdb_key' },
            profiles: [{
                id: 'prof_1',
                name: 'Test Profile',
                catalogs: [{ id: 'yaca_preset_nonexistent_preset', name: 'Unknown', type: 'movie' }]
            }],
            activeProfileId: 'prof_1'
        };

        const result = await catalogHandler({
            type: 'movie',
            id: 'yaca_preset_nonexistent_preset',
            extra: { skip: 0 }
        }, userConfig);

        // No filters found → empty metas
        expect(fetchTmdbCatalog).not.toHaveBeenCalled();
        expect(result.metas).toEqual([]);
    });
});
