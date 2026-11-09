/**
 * tests/feedProtocolAndCatalogs.test.js
 *
 * Ticket 46:
 * - Manifest protocol verification: le quattro righe hero storiche (8 id: mondi, passo_fuori,
 *   uscite_nuove, nicchia_di_qualita) — il registro ne ha 20 dal Ticket 13
 *   are present and the 4 legacy hero pairs (8 catalogs) are completely absent.
 * - Hero catalogs are additive and non-sortable (extra has only skip).
 * - Delivery of feed catalogs (mondi, passo_fuori, uscite_nuove, nicchia_di_qualita, simulcast, watchlist, sql presets)
 *   with non-zero title counts (> 0).
 */

const { buildManifest } = require('../src/api/stremio');
const { catalogHandler } = require('../src/stremio');
const { getHybridCatalog } = require('../src/stremio/hybridServing');
const graphClient = require('../src/clients/graphClient');
const library = require('../src/library');
const DuckDbProvider = require('../src/indice/duckDbProvider');
const TasteProfile = require('../src/models/TasteProfile');
const { hybridRecommendationsCache, catalogRequestCache } = require('../src/cache/cacheInstances');

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true })
}));

jest.mock('../src/models/UserAccount', () => ({
    findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) }))
}));

jest.mock('../src/models/AddonConfig', () => ({
    findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) }))
}));

jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/library', () => {
    const actual = jest.requireActual('../src/library');
    return {
        ...actual,
        leggiWatchlist: jest.fn().mockResolvedValue([
            { itemId: 'tmdb:501', tmdbId: 501, type: 'movie', name: 'Mio Film Salvato', poster: '/mfs.jpg' }
        ])
    };
});


jest.mock('../src/clients/tmdb', () => ({
    createTmdbClient: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ data: {} })
    })),
    getTmdbMovieDetails: jest.fn(),
    getTmdbMetaDetails: jest.fn()
}));

jest.mock('../src/indice/duckDbProvider', () => {
    const actual = jest.requireActual('../src/indice/duckDbProvider');
    return {
        ...actual,
        getDuckDbMetaDetails: jest.fn(),
        getDuckDbCatalogFromPreset: jest.fn()
    };
});

const AiringStateProvider = require('../src/stremio/providers/AiringStateProvider');
const WatchlistProvider = require('../src/stremio/providers/WatchlistProvider');

describe('Ticket 46: Feed & Protocol Verification for New Graph Catalogs', () => {
    const userConfig = {
        userId: 'u_ticket46',
        activeProfileId: 'p_main',
        apiKeys: { tmdb: 'fake_tmdb_key' },
        profiles: [{
            id: 'p_main',
            name: 'Profilo Principale',
            settings: {
                typeSelectors: { film: true, serie: true, anime: null },
                kidsMode: false
            },
            catalogs: [
                { id: 'preset_pop_movies', name: 'Film Popolari', type: 'movie' }
            ]
        }],
        addonUuid: 'u_ticket46'
    };

    beforeEach(() => {
        jest.clearAllMocks();
        graphClient.resetHealthCache();
        hybridRecommendationsCache.getWithStatus = jest.fn().mockResolvedValue({ value: null, status: 'miss' });
        hybridRecommendationsCache.set = jest.fn().mockResolvedValue(null);
        hybridRecommendationsCache.delete = jest.fn().mockResolvedValue(null);
        hybridRecommendationsCache.clear = jest.fn().mockResolvedValue(null);
        catalogRequestCache.getWithStatus = jest.fn().mockResolvedValue({ value: null, status: 'miss' });
        catalogRequestCache.set = jest.fn().mockResolvedValue(null);
    });



    describe('3. I cataloghi del feed sopravvissuti riempiono con conteggio > 0', () => {
        test('preset_pop_movies risponde via DuckDbProvider con titoli > 0', async () => {
            DuckDbProvider.getDuckDbCatalogFromPreset.mockResolvedValueOnce([
                { id: 'tmdb:10', name: 'Popular 10', type: 'movie', poster: '/p10.jpg' },
                { id: 'tmdb:11', name: 'Popular 11', type: 'movie', poster: '/p11.jpg' }
            ]);

            const res = await catalogHandler(
                { id: 'preset_pop_movies', type: 'movie', extra: {} },
                userConfig,
                'http://localhost:7000'
            );

            expect(res.metas.length).toBe(2);
            expect(res.metas[0].id).toBe('tmdb:10');
        });

        test('preset_anime_simulcast risponde con titoli > 0', async () => {
            const { animeAiringState } = require('../src/anime');
            const doc = {
                _id: '12345',
                tmdbId: 12345,
                schemaVersion: 1,
                ids: { tmdb: 12345, kitsu: '12345' },
                title: 'Frieren Season 2',
                homeReleases: {
                    checkedAt: new Date().toISOString(),
                    sub: { episode: 5, airedAt: new Date().toISOString() },
                    dub: null
                },
                italian: {
                    sub: { latest: { season: 1, episode: 5 } },
                    dub: { latest: null }
                },
                episodes: []
            };
            animeAiringState.setDataSourceForTests(async () => [doc]);
            DuckDbProvider.getDuckDbCatalogFromPreset.mockResolvedValue([
                { id: 'kitsu:12345', name: 'Frieren Season 2', type: 'series', poster: '/frieren.jpg', _tmdbId: 12345, isAnime: true, _isAnime: true }
            ]);

            const res = await catalogHandler(
                { id: 'preset_anime_simulcast', type: 'series', extra: {} },
                { ...userConfig, uuid: 'u_ticket46' },
                'http://localhost:7000'
            );

            expect(res.metas.length).toBeGreaterThan(0);
            expect(res.metas[0].id).toBe('kitsu:12345');
            animeAiringState.resetForTests();
        });

        test('yaca_watchlist_movies risponde con titoli > 0', async () => {
            library.leggiWatchlist.mockResolvedValueOnce([
                { itemId: 'tmdb:501', tmdbId: 501, type: 'movie', name: 'Mio Film Salvato', poster: '/mfs.jpg' }
            ]);

            const res = await catalogHandler(
                { id: 'yaca_watchlist_movies', type: 'movie', extra: {} },
                { ...userConfig, uuid: 'u_ticket46' },
                'http://localhost:7000'
            );

            expect(res.metas.length).toBe(1);
            expect(res.metas[0].id).toBe('tmdb:501');
        });
    });
});
