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
    getImageKitUrl: jest.fn((url, text) => text
        ? `https://ik.imagekit.io/mock-id/badge/${encodeURIComponent(text)}/${encodeURIComponent(url)}`
        : `https://ik.imagekit.io/mock-id/plain/${encodeURIComponent(url)}`)
}));

jest.mock('../src/engines/hybridRecommendations', () => ({
    getHybridCatalog: jest.fn()
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

jest.mock('../src/profile/ProfileScorer', () => ({
    calculateItemMatch: jest.fn(() => 0)
}));

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/utils/rateLimiter', () => ({
    rateLimitedMap: jest.fn(async (items, fn) => Promise.all(items.map(fn)))
}));

jest.mock('../src/models/CacheEntry', () => ({
    find: jest.fn(() => ({ limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })) }))
}));

jest.mock('../src/models/TmdbScoringData', () => ({
    find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) }))
}));

jest.mock('../src/data/presets', () => ({
    getPresets: jest.fn(() => [])
}));

const { fetchTmdbCatalog } = require('../src/clients/tmdb');
const { fetchKitsuCatalog, fetchKitsuEpisodes } = require('../src/clients/kitsu');
const { routeLiveStremioSearch } = require('../src/ai/router');
const { getHybridCatalog } = require('../src/engines/hybridRecommendations');
const { getPresets } = require('../src/data/presets');
const TasteProfile = require('../src/models/TasteProfile');
const TmdbScoringData = require('../src/models/TmdbScoringData');
const ProfileScorer = require('../src/profile/ProfileScorer');
const UserAccount = require('../src/db/models/UserAccount');
const { getTmdbMovieDetails } = require('../src/clients/tmdb');
const { catalogHandler } = require('../src/handlers/catalogHandler');

describe('catalogHandler critical recommendation/search fixes', () => {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    beforeEach(() => {
        jest.clearAllMocks();
        TmdbScoringData.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
        UserAccount.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
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

    it('hydrates missing Trakt token from UserAccount for Trakt-dependent hybrid catalogs', async () => {
        UserAccount.findOne.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({
                apiKeys: { trakt: 'db_trakt_token', traktRefreshToken: 'db_refresh' }
            })
        });
        getHybridCatalog.mockResolvedValueOnce([{ id: 'tmdb:11', name: 'Seed Item', type: 'movie' }]);

        const userConfig = {
            userId: 'user_1',
            activeProfileId: 'global',
            apiKeys: { tmdb: 'tmdb_key' },
            profiles: []
        };

        const result = await catalogHandler({
            type: 'movie',
            id: 'yaca_seed_network_movies',
            extra: { skip: 0 }
        }, userConfig, 'http://localhost:7000');

        expect(UserAccount.findOne).toHaveBeenCalledWith({ userId: 'user_1' });
        expect(getHybridCatalog).toHaveBeenCalledWith(
            'yaca_seed_network_movies',
            0,
            'db_trakt_token',
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
        expect(result.metas[0].poster).toContain('https://ik.imagekit.io/mock-id/badge/');
        expect(result.metas[0].poster).toContain(encodeURIComponent('Ep 12'));
        expect(result.metas[0].videos).toBeUndefined();
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
        expect(result.metas[0].poster).toContain('https://ik.imagekit.io/mock-id/badge/');
        expect(result.metas[1].poster).toContain('https://ik.imagekit.io/mock-id/badge/');
    });

    it('merges popularity catalogs horizontally at the requested skip and reranks only the current page', async () => {
        const profileDoc = {
            settings: {},
            genreScores: new Map([['18', 20]]),
            keywordScores: new Map(),
            directorScores: new Map(),
            actorScores: new Map(),
            tmdbWeight: 1,
            traktWeight: 1
        };
        TasteProfile.findOne
            .mockResolvedValueOnce(profileDoc)
            .mockResolvedValueOnce(null);
        getPresets.mockReturnValue([
            {
                id: 'preset_merged_popularity',
                source: 'merged',
                filters: {
                    merge: {
                        catalogs: ['source_a', 'source_b'],
                        sourceFilters: [
                            { strategy: 'discovery', sort_by: 'popularity.desc' },
                            { strategy: 'discovery', sort_by: 'popularity.desc' }
                        ],
                        sourceTypes: ['movie', 'movie'],
                        strategy: 'popularity'
                    }
                }
            }
        ]);
        fetchTmdbCatalog
            .mockResolvedValueOnce([
                { id: 'tmdb:100', type: 'movie', name: 'A', popularity: 100, genre_ids: [18] },
                { id: 'tmdb:101', type: 'movie', name: 'B', popularity: 90, genre_ids: [28] }
            ])
            .mockResolvedValueOnce([
                { id: 'tmdb:102', type: 'movie', name: 'C', popularity: 95, genre_ids: [18] },
                { id: 'tmdb:101', type: 'movie', name: 'B duplicate', popularity: 90, genre_ids: [28] }
            ]);
        ProfileScorer.calculateItemMatch
            .mockReturnValueOnce(1)
            .mockReturnValueOnce(10)
            .mockReturnValueOnce(2);

        const result = await catalogHandler({
            type: 'movie',
            id: 'yaca_preset_preset_merged_popularity',
            extra: { skip: 20 }
        }, {
            userId: 'user_1',
            activeProfileId: 'prof1',
            apiKeys: { tmdb: 'tmdb_key' },
            profiles: [{ id: 'prof1', settings: {} }]
        }, 'https://host.test');

        expect(fetchTmdbCatalog).toHaveBeenNthCalledWith(
            1,
            expect.any(Object),
            '/discover/movie',
            20,
            expect.any(Object),
            'movie',
            expect.any(Object)
        );
        expect(fetchTmdbCatalog).toHaveBeenNthCalledWith(
            2,
            expect.any(Object),
            '/discover/movie',
            20,
            expect.any(Object),
            'movie',
            expect.any(Object)
        );
        expect(result.metas.map(item => item.id)).toEqual(['tmdb:102', 'tmdb:101', 'tmdb:100']);
    });

    it('hydrates light mode items from local cache before ProfileScorer ranking', async () => {
        const profileDoc = { settings: {}, genreScores: new Map() };
        TasteProfile.findOne
            .mockResolvedValueOnce(profileDoc)
            .mockResolvedValueOnce(null);
        getPresets.mockReturnValue([
            {
                id: 'preset_cache_hydration',
                filters: { sort_by: 'popularity.desc' }
            }
        ]);
        fetchTmdbCatalog.mockResolvedValueOnce([
            { id: 'tmdb:55', type: 'movie', name: 'Light Item', imdbRating: '7.1' }
        ]);
        getTmdbMovieDetails.mockResolvedValueOnce({
            id: 55,
            title: 'Hydrated Item',
            credits: { cast: [{ name: 'Actor One' }] },
            keywords: { keywords: [{ id: 1, name: 'mystery' }] }
        });

        const userConfig = {
            userId: 'user_1',
            activeProfileId: 'prof1',
            apiKeys: { tmdb: 'tmdb_key' },
            profiles: [{ id: 'prof1', settings: {} }]
        };

        const result = await catalogHandler({
            type: 'movie',
            id: 'yaca_preset_preset_cache_hydration',
            extra: { skip: 0 }
        }, userConfig, 'https://host.test');

        expect(getTmdbMovieDetails).toHaveBeenCalledWith('tmdb_key', '55', 'movie', { cacheOnly: true });
        expect(ProfileScorer.calculateItemMatch).toHaveBeenCalledWith(
            expect.objectContaining({
                credits: expect.objectContaining({ cast: expect.any(Array) }),
                keywords: expect.objectContaining({ keywords: expect.any(Array) })
            }),
            profileDoc,
            expect.any(Object)
        );
        expect(result.metas[0]).toMatchObject({
            id: 'tmdb:55',
            type: 'movie',
            name: 'Light Item',
            posterShape: 'poster',
            imdbRating: '7.1'
        });
        expect(result.metas[0].rawTMDB).toBeUndefined();
        expect(result.metas[0].cast).toBeUndefined();
        expect(result.metas[0].keywords).toBeUndefined();
        expect(result.metas[0].weight).toBeUndefined();
        expect(result.metas[0].affinity).toBeUndefined();
        expect(result.metas[0].finalScore).toBeUndefined();
    });

    it('keeps scoring with light mode item when cache hydration misses', async () => {
        const profileDoc = { settings: {}, genreScores: new Map() };
        TasteProfile.findOne
            .mockResolvedValueOnce(profileDoc)
            .mockResolvedValueOnce(null);
        getPresets.mockReturnValue([
            {
                id: 'preset_cache_miss',
                filters: { sort_by: 'popularity.desc' }
            }
        ]);
        fetchTmdbCatalog.mockResolvedValueOnce([
            { id: 'tmdb:77', type: 'movie', name: 'Fallback Light Item', imdbRating: '6.5' }
        ]);
        getTmdbMovieDetails.mockResolvedValueOnce(null);

        const userConfig = {
            userId: 'user_1',
            activeProfileId: 'prof1',
            apiKeys: { tmdb: 'tmdb_key' },
            profiles: [{ id: 'prof1', settings: {} }]
        };

        await catalogHandler({
            type: 'movie',
            id: 'yaca_preset_preset_cache_miss',
            extra: { skip: 0 }
        }, userConfig, 'https://host.test');

        expect(getTmdbMovieDetails).toHaveBeenCalledWith('tmdb_key', '77', 'movie', { cacheOnly: true });
        expect(ProfileScorer.calculateItemMatch).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'tmdb:77', name: 'Fallback Light Item' }),
            profileDoc,
            expect.any(Object)
        );
    });
});
