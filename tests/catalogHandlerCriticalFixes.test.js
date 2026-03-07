jest.mock('../src/clients/tmdb', () => ({
    fetchTmdbCatalog: jest.fn(),
    createTmdbClient: jest.fn(() => ({})),
    getTmdbIdByName: jest.fn(),
    getTmdbMovieDetails: jest.fn().mockResolvedValue(null)
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
}));

jest.mock('../src/ai/router', () => ({
    routeLiveStremioSearch: jest.fn()
}));

jest.mock('../src/engines/hybridRecommendations', () => ({
    getHybridCatalog: jest.fn()
}));

jest.mock('../src/db/models/UserList', () => ({
    findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) }))
}));

jest.mock('../src/db/models/TasteProfile', () => ({
    findOne: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/db/models/UserActivity', () => ({
    create: jest.fn().mockResolvedValue(null),
    find: jest.fn(() => ({ sort: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([]) })) }))
}));

jest.mock('../src/profile/ProfileScorer', () => ({
    calculateItemMatch: jest.fn(() => 0)
}));

jest.mock('../src/db/models/CacheEntry', () => ({
    find: jest.fn(() => ({ limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })) }))
}));

jest.mock('../src/data/presets', () => ({
    getPresets: jest.fn(() => [])
}));

const { fetchTmdbCatalog } = require('../src/clients/tmdb');
const { routeLiveStremioSearch } = require('../src/ai/router');
const { getHybridCatalog } = require('../src/engines/hybridRecommendations');
const { catalogHandler } = require('../src/handlers/catalogHandler');

describe('catalogHandler critical recommendation/search fixes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('executes hybrid catalogs even when trakt token is missing', async () => {
        getHybridCatalog.mockResolvedValueOnce([{ id: 'tmdb:1', name: 'Hybrid Item', type: 'movie' }]);

        const userConfig = {
            userId: 'user_1',
            activeProfileId: 'global',
            apiKeys: { tmdb: 'tmdb_key' },
            profiles: []
        };

        const result = await catalogHandler({
            type: 'movie',
            id: 'yaca_hybrid_movies',
            extra: { skip: 0 }
        }, userConfig, 'http://localhost:7000');

        expect(getHybridCatalog).toHaveBeenCalledWith(
            'yaca_hybrid_movies',
            0,
            undefined,
            'tmdb_key',
            'user_1',
            'global'
        );
        expect(result.metas).toHaveLength(1);
    });

    it('keeps search results when AI routing throws (Mistral down)', async () => {
        fetchTmdbCatalog.mockResolvedValue([{ id: 'tmdb:2', name: 'Simple Result', type: 'movie' }]);
        routeLiveStremioSearch.mockRejectedValueOnce(new Error('Mistral unavailable'));

        const userConfig = {
            userId: 'user_1',
            activeProfileId: 'global',
            apiKeys: { tmdb: 'tmdb_key', mistral: 'mistral_key' },
            profiles: []
        };

        const result = await catalogHandler({
            type: 'movie',
            id: 'yaca_search_movies',
            extra: { skip: 0, search: 'matrix' }
        }, userConfig, 'http://localhost:7000');

        expect(fetchTmdbCatalog).toHaveBeenCalled();
        expect(result.metas.length).toBeGreaterThan(0);
        expect(result.metas[0].id).toBe('tmdb:2');
    });
});
