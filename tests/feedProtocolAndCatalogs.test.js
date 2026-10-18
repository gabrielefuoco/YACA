/**
 * tests/feedProtocolAndCatalogs.test.js
 *
 * Ticket 46:
 * - Manifest protocol verification: 8 hero catalogs (mondi, passo_fuori, uscite_nuove, nicchia_di_qualita)
 *   are present and the 4 legacy hero pairs (8 catalogs) are completely absent.
 * - Hero catalogs are additive and non-sortable (extra has only skip).
 * - Delivery of feed catalogs (mondi, passo_fuori, uscite_nuove, nicchia_di_qualita, simulcast, watchlist, sql presets)
 *   with non-zero title counts (> 0).
 */

const { buildManifest } = require('../src/api/stremio');
const { catalogHandler } = require('../src/handlers/catalogHandler');
const { getHybridCatalog } = require('../src/engines/hybridRecommendations');
const graphClient = require('../src/clients/graphClient');
const library = require('../src/library');
const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');
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

jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return {
        ...actual,
        getDuckDbMetaDetails: jest.fn(),
        getDuckDbCatalogFromPreset: jest.fn()
    };
});

const AiringStateProvider = require('../src/catalog/providers/AiringStateProvider');
const WatchlistProvider = require('../src/catalog/providers/WatchlistProvider');

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

    describe('1. Manifest protocol verification', () => {
        test('il manifest include gli 8 hero cataloghi del grafo e ZERO di quelli rimossi', () => {
            const manifest = buildManifest(userConfig, userConfig.profiles[0]);
            expect(manifest).toBeDefined();
            expect(Array.isArray(manifest.catalogs)).toBe(true);

            const catIds = manifest.catalogs.map(c => c.id);

            // Gli 8 hero cataloghi del grafo DEVONO essere presenti
            const expectedHeroIds = [
                'yaca_mondi_movies',
                'yaca_mondi_series',
                'yaca_passo_fuori_movies',
                'yaca_passo_fuori_series',
                'yaca_uscite_nuove_movies',
                'yaca_uscite_nuove_series',
                'yaca_nicchia_di_qualita_movies',
                'yaca_nicchia_di_qualita_series'
            ];
            for (const hId of expectedHeroIds) {
                expect(catIds).toContain(hId);
            }

            // I 4 vecchi cataloghi hero rimossi (8 id) NON DEVONO esistere nel manifest
            const legacyHeroIds = [
                'yaca_true_blend_movies',
                'yaca_true_blend_series',
                'yaca_seed_network_movies',
                'yaca_seed_network_series',
                'yaca_hidden_gems_movies',
                'yaca_hidden_gems_series',
                'yaca_trakt_filtered_movies',
                'yaca_trakt_filtered_series'
            ];
            for (const legacyId of legacyHeroIds) {
                expect(catIds).not.toContain(legacyId);
            }

            // Gli hero catalogo non hanno extra sortBy (solo skip)
            for (const hId of expectedHeroIds) {
                const cat = manifest.catalogs.find(c => c.id === hId);
                expect(cat.extra).toEqual([{ name: 'skip' }]);
                expect(cat.extra.find(e => e.name === 'sortBy')).toBeUndefined();
            }
        });
    });

    describe('2. Delivery dei due nuovi cataloghi e conteggio titoli > 0', () => {
        beforeEach(() => {
            jest.spyOn(library, 'semiDi').mockResolvedValue({
                seeds: new Map([['603', 4], ['314', 3]]),
                counts: { loved: 1, liked: 1, watched: 0, library: 0 }
            });

            jest.spyOn(graphClient, 'raccomanda').mockResolvedValue({
                contratto: 1,
                versioni: { artefatto: 'art-46', ricetta: 'ric-46' },
                semi: { n: 2, da_catalogo: false },
                liste: [
                    {
                        ruolo: 'il_tuo_mondo',
                        mondo: 1084,
                        descrizione: 'il tuo mondo 1084',
                        titoli: [
                            { tmdbId: 603, medium: 'movie', punteggio: 0.95 },
                            { tmdbId: 604, medium: 'movie', punteggio: 0.90 }
                        ]
                    },
                    {
                        ruolo: 'un_passo_fuori',
                        mondo: null,
                        descrizione: 'mondi vicini',
                        titoli: [
                            { tmdbId: 701, medium: 'movie', punteggio: 0.85 },
                            { tmdbId: 702, medium: 'movie', punteggio: 0.82 }
                        ]
                    },
                    {
                        ruolo: 'uscite_nuove',
                        mondo: null,
                        descrizione: 'uscite recenti',
                        da_comporre: true,
                        titoli: [
                            { tmdbId: 801, medium: 'movie', punteggio: 0.88 },
                            { tmdbId: 802, medium: 'movie', punteggio: 0.84 },
                            { tmdbId: 803, medium: 'movie', punteggio: 0.81 }
                        ]
                    },
                    {
                        ruolo: 'nicchia_di_qualita',
                        mondo: null,
                        descrizione: 'nicchia di qualità',
                        da_comporre: true,
                        titoli: [
                            { tmdbId: 901, medium: 'movie', punteggio: 0.79 },
                            { tmdbId: 902, medium: 'movie', punteggio: 0.75 }
                        ]
                    }
                ],
                motivi: []
            });

            // Mock metadata resolution
            DuckDbProvider.getDuckDbMetaDetails.mockImplementation(async (id) => {
                const num = Number(String(id).replace('tmdb:', ''));
                const rawTMDB = {
                    id: num,
                    title: `Film Test ${num}`,
                    name: `Film Test ${num}`,
                    poster_path: `/${num}.jpg`,
                    vote_average: 8.0,
                    vote_count: 500,
                    release_date: '2025-01-01'
                };
                return {
                    id: `tmdb:${num}`,
                    name: `Film Test ${num}`,
                    type: 'movie',
                    poster: `https://image.tmdb.org/t/p/w500/${num}.jpg`,
                    vote_average: 8.0,
                    vote_count: 500,
                    release_date: '2025-01-01',
                    rawTMDB
                };
            });
        });

        test('yaca_uscite_nuove_movies restituisce titoli validi con conteggio > 0', async () => {
            const res = await catalogHandler(
                { id: 'yaca_uscite_nuove_movies', type: 'movie', extra: {} },
                userConfig,
                'http://localhost:7000'
            );

            expect(res).toBeDefined();
            expect(Array.isArray(res.metas)).toBe(true);
            expect(res.metas.length).toBe(3);
            expect(res.metas[0].id).toBe('tmdb:801');
            expect(res.metas[0].name).toBe('Film Test 801');
            expect(res.metas[0].type).toBe('movie');
            expect(res.metas[0].poster).toBeDefined();
        });

        test('yaca_nicchia_di_qualita_movies restituisce titoli validi con conteggio > 0', async () => {
            const res = await catalogHandler(
                { id: 'yaca_nicchia_di_qualita_movies', type: 'movie', extra: {} },
                userConfig,
                'http://localhost:7000'
            );

            expect(res).toBeDefined();
            expect(Array.isArray(res.metas)).toBe(true);
            expect(res.metas.length).toBe(2);
            expect(res.metas[0].id).toBe('tmdb:901');
            expect(res.metas[0].name).toBe('Film Test 901');
            expect(res.metas[0].type).toBe('movie');
            expect(res.metas[0].poster).toBeDefined();
        });

        test('yaca_mondi_movies e yaca_passo_fuori_movies continuano a restituire titoli con conteggio > 0', async () => {
            const resMondi = await catalogHandler(
                { id: 'yaca_mondi_movies', type: 'movie', extra: {} },
                userConfig,
                'http://localhost:7000'
            );
            expect(resMondi.metas.length).toBe(2);
            expect(resMondi.metas[0].id).toBe('tmdb:603');

            const resPasso = await catalogHandler(
                { id: 'yaca_passo_fuori_movies', type: 'movie', extra: {} },
                userConfig,
                'http://localhost:7000'
            );
            expect(resPasso.metas.length).toBe(2);
            expect(resPasso.metas[0].id).toBe('tmdb:701');
        });
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
