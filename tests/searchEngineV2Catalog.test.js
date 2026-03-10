jest.mock('../src/clients/tmdb', () => ({
    fetchTmdbCatalog: jest.fn(),
    createTmdbClient: jest.fn(() => ({})),
    getTmdbIdByName: jest.fn(),
    getTmdbMovieDetails: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/clients/kitsu', () => ({
    fetchKitsuCatalog: jest.fn(),
    fetchKitsuEpisodes: jest.fn()
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

jest.mock('../src/utils/imageProcessor', () => ({
    getImageKitUrl: jest.fn((url) => url)
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

jest.mock('../src/utils/rateLimiter', () => ({
    rateLimitedMap: jest.fn(async (items, fn) => Promise.all(items.map(fn)))
}));

jest.mock('../src/db/models/CacheEntry', () => ({
    find: jest.fn(() => ({ limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })) }))
}));

jest.mock('../src/data/presets', () => ({
    getPresets: jest.fn(() => [])
}));

jest.mock('../src/db/models/TmdbScoringData', () => ({
    find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) }))
}));

const { catalogHandler } = require('../src/handlers/catalogHandler');
const { fetchTmdbCatalog } = require('../src/clients/tmdb');
const { routeLiveStremioSearch } = require('../src/ai/router');
const ProfileScorer = require('../src/profile/ProfileScorer');

describe('Search Engine V2 catalog routing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('keeps yaca_search_standard pure by bypassing AI and profile reranking', async () => {
        fetchTmdbCatalog.mockResolvedValueOnce([
            { id: 'tmdb:10', name: 'Avatar', type: 'movie', imdbRating: '7.8' }
        ]);

        const result = await catalogHandler({
            type: 'movie',
            id: 'yaca_search_standard',
            extra: { skip: 20, search: 'Avatar' }
        }, {
            userId: 'user-1',
            apiKeys: { tmdb: 'tmdb-key', mistral: 'mistral-key' }
        }, 'http://localhost:7000');

        expect(fetchTmdbCatalog).toHaveBeenCalledWith(
            expect.anything(),
            '/search/movie',
            20,
            { query: 'Avatar' },
            'movie',
            expect.any(Object)
        );
        expect(routeLiveStremioSearch).not.toHaveBeenCalled();
        expect(ProfileScorer.calculateItemMatch).not.toHaveBeenCalled();
        expect(result.metas).toHaveLength(1);
        expect(result.metas[0].name).toBe('Avatar');
    });

    it('runs AI planner queries in parallel pages and ranks consensus titles first', async () => {
        routeLiveStremioSearch.mockResolvedValueOnce({
            filters: {
                queries: [
                    { strategy: 'multi_search', text_search: 'Game of Thrones', target: 'tmdb' },
                    { strategy: 'multi_search', text_search: 'Bridgerton', target: 'tmdb' }
                ]
            }
        });

        fetchTmdbCatalog.mockImplementation(async (_client, _endpoint, skip, params) => {
            expect(skip).toBe(20);

            if (params.query === 'Game of Thrones') {
                return [
                    { id: 'tmdb:100', name: 'Consensus Pick', type: 'series', imdbRating: '7.0', popularity: 50 },
                    { id: 'tmdb:101', name: 'GoT Only', type: 'series', imdbRating: '9.0', popularity: 40 }
                ];
            }

            if (params.query === 'Bridgerton') {
                return [
                    { id: 'tmdb:100', name: 'Consensus Pick', type: 'series', imdbRating: '7.0', popularity: 50 },
                    { id: 'tmdb:102', name: 'Bridgerton Only', type: 'series', imdbRating: '8.0', popularity: 30 }
                ];
            }

            return [];
        });

        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_search_ai',
            extra: { skip: 20, search: 'Io amo Game of Thrones ma la mia ragazza Bridgerton' }
        }, {
            apiKeys: { tmdb: 'tmdb-key', mistral: 'mistral-key' }
        }, 'http://localhost:7000');

        expect(routeLiveStremioSearch).toHaveBeenCalledTimes(1);
        expect(fetchTmdbCatalog).toHaveBeenCalledTimes(2);
        expect(result.metas.map(item => item.id)).toEqual(['tmdb:100', 'tmdb:101', 'tmdb:102']);
    });
});
