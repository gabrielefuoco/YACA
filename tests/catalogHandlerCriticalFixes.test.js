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

const { fetchTmdbCatalog } = require('../src/clients/tmdb');
const { fetchKitsuCatalog, fetchKitsuEpisodes } = require('../src/clients/kitsu');
const { routeLiveStremioSearch } = require('../src/ai/router');
const { getHybridCatalog } = require('../src/engines/hybridRecommendations');
const { getPresets } = require('../src/data/presets');
const { catalogHandler } = require('../src/handlers/catalogHandler');

describe('catalogHandler critical recommendation/search fixes', () => {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

    it('passes disableLightMode=true for badge-enabled series catalogs', async () => {
        fetchTmdbCatalog.mockResolvedValue([{ id: 'tmdb:10', type: 'series', name: 'Series Item' }]);

        const userConfig = {
            userId: 'user_1',
            activeProfileId: 'global',
            apiKeys: { tmdb: 'tmdb_key' },
            profiles: []
        };

        await catalogHandler({
            type: 'series',
            id: 'yaca_discover_series',
            extra: { skip: 20 }
        }, userConfig, 'http://localhost:7000');

        expect(fetchTmdbCatalog).toHaveBeenCalled();
        const lastCall = fetchTmdbCatalog.mock.calls[0];
        expect(lastCall[5]).toEqual(expect.objectContaining({ disableLightMode: true }));
    });

    it('enriches anime simulcast with episodes and applies episode badge', async () => {
        const pastDate = new Date(Date.now() - MS_PER_DAY).toISOString();
        fetchKitsuCatalog.mockResolvedValue([
            {
                id: 'kitsu:42',
                type: 'series',
                name: 'Anime Simulcast',
                poster: 'https://kitsu.test/poster.jpg'
            }
        ]);
        fetchKitsuEpisodes.mockResolvedValue([
            { season: 1, episode: 12, released: pastDate }
        ]);

        const userConfig = {
            userId: 'user_1',
            activeProfileId: 'global',
            apiKeys: { tmdb: 'tmdb_key' },
            profiles: []
        };

        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_anime_trending',
            extra: { skip: 0 }
        }, userConfig, 'https://host.test');

        expect(fetchKitsuEpisodes).toHaveBeenCalledWith('42');
        expect(result.metas[0].videos).toHaveLength(1);
        expect(result.metas[0].poster).toContain('https://host.test/badge/poster.jpg');
        expect(result.metas[0].poster).toContain('text=E12');
    });

    it('applies episode badge on merged early return via finalizeCatalog', async () => {
        const pastDate = new Date(Date.now() - MS_PER_DAY).toISOString();
        getPresets.mockReturnValue([
            {
                id: 'preset_new_series_eps',
                source: 'merged',
                filters: {
                    merge: {
                        catalogs: ['source_a', 'source_b'],
                        sourceFilters: [
                            { strategy: 'discovery', sort_by: 'popularity.desc' },
                            { strategy: 'discovery', sort_by: 'popularity.desc' }
                        ],
                        sourceTypes: ['series', 'series'],
                        strategy: 'popularity'
                    }
                }
            }
        ]);
        fetchTmdbCatalog
            .mockResolvedValueOnce([{
                id: 'tmdb:100',
                type: 'series',
                name: 'Merged A',
                popularity: 100,
                poster: 'https://image.tmdb.org/t/p/w500/a.jpg',
                videos: [{ season: 1, episode: 5, released: pastDate }]
            }])
            .mockResolvedValueOnce([{
                id: 'tmdb:101',
                type: 'series',
                name: 'Merged B',
                popularity: 90,
                poster: 'https://image.tmdb.org/t/p/w500/b.jpg',
                videos: [{ season: 1, episode: 4, released: pastDate }]
            }]);

        const userConfig = {
            userId: 'user_1',
            activeProfileId: 'global',
            apiKeys: { tmdb: 'tmdb_key' },
            profiles: []
        };

        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_preset_preset_new_series_eps',
            extra: { skip: 0 }
        }, userConfig, 'https://host.test');

        expect(result.metas).toHaveLength(2);
        expect(result.metas[0].poster).toContain('https://host.test/badge/poster.jpg');
        expect(result.metas[1].poster).toContain('https://host.test/badge/poster.jpg');
    });
});
