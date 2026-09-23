const stremioRouter = require('../src/api/stremio');
const { routeCatalogRequest } = require('../src/catalog/CatalogRouter');
const { getWatchlistCatalog } = require('../src/catalog/providers/WatchlistProvider');
const LibrarySyncService = require('../src/services/LibrarySyncService');
const { normalizeLegacyId } = require('../scripts/migrate_library_itemid_null');
const UserLibraryItem = require('../src/db/models/UserLibraryItem');
const { executeUniversalPipeline } = require('../src/catalog/providers/AiDiscoveryProvider');

jest.mock('../src/db/models/UserLibraryItem');
jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn().mockResolvedValue(null)
}));
jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn().mockResolvedValue(null)
}));
jest.mock('../src/catalog/providers/AiDiscoveryProvider', () => ({
    executeCombinedSearch: jest.fn(),
    executeUniversalPipeline: jest.fn()
}));

describe('Ticket 14: Fix Cataloghi & Manifest', () => {

    describe('1. BUG-03-A & BUG-03-H: Manifest Catalogs Dedup & Anime Type', () => {
        test('Deduplica i cataloghi custom presenti sia in profile.catalogs che in userConfig.customCatalogs (precedenza profilo)', () => {
            const userConfig = {
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Test Profile',
                    catalogs: [
                        { id: 'custom_matchmaker_1', name: 'Profile Version Matchmaker', type: 'movie' },
                        { id: 'profile_anime_cat', name: 'Anime Dal Profilo', type: 'anime' }
                    ]
                }],
                customCatalogs: [
                    { id: 'custom_matchmaker_1', name: 'UserConfig Version Matchmaker', type: 'movie' },
                    { id: 'custom_unique_2', name: 'Unique Custom', type: 'series' }
                ]
            };

            const manifest = stremioRouter.buildManifest(userConfig, 'http://localhost:7000', 'testHandle');

            // Trova tutte le occorrenze di custom_matchmaker_1
            const matchmakerOccurrences = manifest.catalogs.filter(c => c.id === 'custom_matchmaker_1');
            expect(matchmakerOccurrences.length).toBe(1);
            expect(matchmakerOccurrences[0].name).toBe('Profile Version Matchmaker');

            // Verifica che il custom univoco sia presente
            const uniqueOccurrences = manifest.catalogs.filter(c => c.id === 'custom_unique_2');
            expect(uniqueOccurrences.length).toBe(1);

            // Verifica che yaca_search_standard e yaca_search_ai compaiano ESATTAMENTE 2 volte (movie e series)
            const searchStandardOccurrences = manifest.catalogs.filter(c => c.id === 'yaca_search_standard');
            expect(searchStandardOccurrences.length).toBe(2);
            expect(searchStandardOccurrences.map(c => c.type).sort()).toEqual(['movie', 'series']);

            const searchAiOccurrences = manifest.catalogs.filter(c => c.id === 'yaca_search_ai');
            expect(searchAiOccurrences.length).toBe(2);
            expect(searchAiOccurrences.map(c => c.type).sort()).toEqual(['movie', 'series']);
        });

        test('BUG-03-H: non appiattisce il tipo anime a movie nei cataloghi di profilo', () => {
            const userConfig = {
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    catalogs: [
                        { id: 'cat_anime_1', name: 'Catalogo Anime Type', type: 'anime' },
                        { id: 'cat_anime_2', name: 'Catalogo Anime Kind', kind: 'anime' },
                        { id: 'cat_series_1', name: 'Catalogo Serie', type: 'series' },
                        { id: 'cat_movie_1', name: 'Catalogo Film', type: 'movie' }
                    ]
                }]
            };

            const manifest = stremioRouter.buildManifest(userConfig);
            const anime1 = manifest.catalogs.find(c => c.id === 'cat_anime_1');
            const anime2 = manifest.catalogs.find(c => c.id === 'cat_anime_2');
            const series1 = manifest.catalogs.find(c => c.id === 'cat_series_1');
            const movie1 = manifest.catalogs.find(c => c.id === 'cat_movie_1');

            expect(anime1.type).toBe('anime');
            expect(anime2.type).toBe('anime');
            expect(series1.type).toBe('series');
            expect(movie1.type).toBe('movie');
        });

        test('resolveCatalogType helper supporta kind, type e fallback movie', () => {
            const { resolveCatalogType } = stremioRouter;
            expect(resolveCatalogType({ type: 'anime' })).toBe('anime');
            expect(resolveCatalogType({ kind: 'anime' })).toBe('anime');
            expect(resolveCatalogType({ type: 'series' })).toBe('series');
            expect(resolveCatalogType({ kind: 'series' })).toBe('series');
            expect(resolveCatalogType({ type: 'other' })).toBe('other');
            expect(resolveCatalogType({ type: 'movie' })).toBe('movie');
            expect(resolveCatalogType(null)).toBe('movie');
            expect(resolveCatalogType({})).toBe('movie');
        });
    });

    describe('2. BUG-03-B: Merged custom con sorgenti in userConfig.customCatalogs', () => {
        test('routeCatalogRequest risolve sorgenti merged da userConfig.customCatalogs con precedenza profilo -> custom -> preset', async () => {
            const userConfig = {
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    catalogs: [
                        { id: 'src_from_profile', queries: [{ with_genres: '28' }] }
                    ]
                }],
                customCatalogs: [
                    { id: 'src_from_custom', queries: [{ with_genres: '878' }] },
                    // Questo ha lo stesso id del profilo: il profilo deve vincere
                    { id: 'src_from_profile', queries: [{ with_genres: '999' }] }
                ]
            };

            const catalogMeta = {
                id: 'merged_catalog_test',
                name: 'Merged Test',
                source: 'merged',
                filters: {
                    merge: {
                        sources: ['src_from_profile', 'src_from_custom']
                    }
                }
            };

            executeUniversalPipeline.mockImplementation((universalCatalog) => {
                return Promise.resolve(universalCatalog.queries);
            });

            // Invochiamo routeCatalogRequest
            const result = await routeCatalogRequest(
                { id: 'merged_catalog_test', type: 'movie', extra: {} },
                userConfig,
                {}, // tmdbClient
                'fakeApiKey',
                {},
                {},
                catalogMeta
            );

            // Verifica che le query del catalogo universale abbiano unito profilo e custom
            expect(executeUniversalPipeline).toHaveBeenCalled();
            const calledUniversalCatalog = executeUniversalPipeline.mock.calls[0][0];
            expect(calledUniversalCatalog.queries).toBeDefined();
            expect(calledUniversalCatalog.queries.length).toBe(2);
            expect(calledUniversalCatalog.queries[0]).toEqual({ with_genres: '28' });
            expect(calledUniversalCatalog.queries[1]).toEqual({ with_genres: '878' });
            expect(result).toEqual([
                { with_genres: '28' },
                { with_genres: '878' }
            ]);
        });
    });

    describe('3. BUG-03-E: Scenari orfani rimossi da CatalogRouter', () => {
        test('yaca_discover_* e yaca_hybrid_popular_* non sono più gestiti come scenari speciali nel router', async () => {
            const userConfig = { profiles: [] };
            
            // Per id orfani non presenti nel manifest né gestiti con filtri, il router restituisce array vuoto
            const resDiscover = await routeCatalogRequest(
                { id: 'yaca_discover_movies', type: 'movie', extra: {} },
                userConfig,
                {},
                'key',
                {},
                {},
                null
            );
            expect(resDiscover).toEqual([]);

            const resHybridPopular = await routeCatalogRequest(
                { id: 'yaca_hybrid_popular_movies', type: 'movie', extra: {} },
                userConfig,
                {},
                'key',
                {},
                {},
                null
            );
            expect(resHybridPopular).toEqual([]);
        });
    });

    describe('4. BUG-03-C & BUG-03-F: Watchlist Guardia itemId: null e releaseInfo', () => {
        test('getWatchlistCatalog include la guardia itemId != null nella query ed esclude record storici orfani', async () => {
            let capturedQuery = null;
            UserLibraryItem.find.mockImplementation((q) => {
                capturedQuery = q;
                return {
                    sort: () => ({
                        skip: () => ({
                            limit: () => ({
                                lean: () => Promise.resolve([
                                    {
                                        itemId: 'tt0111161',
                                        type: 'movie',
                                        name: 'The Shawshank Redemption',
                                        year: '1994'
                                    }
                                ])
                            })
                        })
                    })
                };
            });

            const userConfig = { addonUuid: 'uuid-123' };
            const metas = await getWatchlistCatalog('yaca_watchlist_movies', 'movie', 0, userConfig, {});

            // Verifica che la query Mongo contenga la guardia su itemId
            expect(capturedQuery).toBeDefined();
            expect(capturedQuery.addonUuid).toBe('uuid-123');
            expect(capturedQuery.removed).toBe(false);
            expect(capturedQuery.itemId).toEqual({
                $ne: null,
                $exists: true,
                $not: { $regex: /^(kitsu|hanime|anilist):/ }
            });

            // Verifica BUG-03-F: releaseInfo mappato da year
            expect(metas.length).toBe(1);
            expect(metas[0].year).toBe('1994');
            expect(metas[0].releaseInfo).toBe('1994');
        });

        test('getWatchlistCatalog per anime applica la guardia itemId != null e $or su kitsu/hanime/anilist o type: anime', async () => {
            let capturedQuery = null;
            UserLibraryItem.find.mockImplementation((q) => {
                capturedQuery = q;
                return {
                    sort: () => ({
                        skip: () => ({
                            limit: () => ({
                                lean: () => Promise.resolve([
                                    {
                                        itemId: 'kitsu:142',
                                        type: 'anime',
                                        name: 'Princess Mononoke',
                                        year: 1997
                                    }
                                ])
                            })
                        })
                    })
                };
            });

            const userConfig = { addonUuid: 'uuid-123' };
            const metas = await getWatchlistCatalog('yaca_watchlist_anime', 'anime', 0, userConfig, {});

            expect(capturedQuery).toBeDefined();
            expect(capturedQuery.addonUuid).toBe('uuid-123');
            expect(capturedQuery.itemId).toEqual({ $ne: null, $exists: true });
            expect(capturedQuery.$or).toEqual([
                { type: 'anime' },
                { itemId: { $regex: /^(kitsu|hanime|anilist):/ } }
            ]);

            expect(metas.length).toBe(1);
            expect(metas[0].type).toBe('anime');
            expect(metas[0].releaseInfo).toBe('1997');
        });
    });

    describe('5. BUG-03-D: Classificazione Anime nel Sync Libreria (LibrarySyncService)', () => {
        test('classifySyncItemType classifica come anime un contenuto Cinemeta con ID TMDB anime', () => {
            const mockStore = {
                isAnimeTmdbId: (id) => String(id) === '31911' // Fullmetal Alchemist
            };

            const cinemetaItem = {
                _id: 'tt0421357',
                name: 'Fullmetal Alchemist',
                type: 'series',
                genre_ids: [16, 10759]
            };

            // Con mapping IMDb -> TMDB risolto (es. 31911)
            const type = LibrarySyncService.classifySyncItemType(cinemetaItem, '31911', mockStore);
            expect(type).toBe('anime');
        });

        test('classifySyncItemType riconosce prefissi kitsu, anilist e hanime come anime', () => {
            expect(LibrarySyncService.classifySyncItemType({ itemId: 'kitsu:123', type: 'series' })).toBe('anime');
            expect(LibrarySyncService.classifySyncItemType({ _id: 'anilist:456', type: 'series' })).toBe('anime');
            expect(LibrarySyncService.classifySyncItemType({ id: 'hanime:789', type: 'series' })).toBe('anime');
        });

        test('classifySyncItemType non trasforma serie occidentali in anime', () => {
            const mockStore = {
                isAnimeTmdbId: () => false
            };

            const westernSeries = {
                _id: 'tt0903747',
                name: 'Breaking Bad',
                type: 'series',
                genre_ids: [18, 80],
                original_language: 'en'
            };

            const type = LibrarySyncService.classifySyncItemType(westernSeries, '1396', mockStore);
            expect(type).toBe('series');
        });
    });

    describe('6. BUG-03-C (b): Script di migrazione normalizzazione ID', () => {
        test('normalizeLegacyId rimuove spazi interni ed esterni', () => {
            expect(normalizeLegacyId('kitsu:142')).toBe('kitsu:142');
            expect(normalizeLegacyId('tmdb: 12477 ')).toBe('tmdb:12477');
            expect(normalizeLegacyId(' tmdb:  999  ')).toBe('tmdb:999');
            expect(normalizeLegacyId('tt0111161 ')).toBe('tt0111161');
            expect(normalizeLegacyId('')).toBeNull();
            expect(normalizeLegacyId(null)).toBeNull();
        });
    });
});
