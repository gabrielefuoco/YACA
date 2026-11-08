/**
 * tests/filtriPrimaDelTaglio.test.js
 *
 * Test di non-regressione per i sei siti di filtraggio prima del taglio (Ticket 11).
 * Unica regola: una sorgente di elementi dove i primi 20 sono non idonei deve
 * restituire 20 elementi idonei, non 0 (nessuna potatura a valle del limite di pagina).
 */

const { catalogHandler } = require('../src/stremio/catalogHandler');
const CatalogRouter = require('../src/stremio/CatalogRouter');
const { getWatchlistCatalog } = require('../src/stremio/providers/WatchlistProvider');
const composer = require('../src/pool/composer');
const idratazione = require('../src/stremio/idratazione');
const indice = require('../src/indice');
const UserLibraryItem = require('../src/library/models/UserLibraryItem');
const duckDbStore = require('../src/indice/duckDbStore');
const cache = require('../src/cache');

describe('I filtri agiscono PRIMA del taglio (Tutti e 6 i siti)', () => {
    beforeEach(() => {
        // Bypassa la cache per testare direttamente la logica di fetch & filter
        jest.spyOn(cache, 'leggi').mockImplementation(async (desc, fetcher) => fetcher());
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // =========================================================================
    // SITO 1: src/stremio/catalogHandler.js (applyKidsMode prima del taglio)
    // =========================================================================
    test('Sito 1: catalogHandler con kidsMode restituisce 20 card idonee anche se i primi 20 sono vietati', async () => {
        // La sorgente restituisce 20 film vietati (thriller/horror) a skip=0 e 20 film per bambini a skip=20
        const adultItems = Array.from({ length: 20 }, (_, i) => ({
            id: `tmdb:${100 + i}`,
            name: `Adult Movie ${i}`,
            type: 'movie',
            media_type: 'movie',
            genre_ids: [53, 27], // Thriller, Horror
            keywords: [{ id: 10292, name: 'gore' }]
        }));

        const kidsItems = Array.from({ length: 20 }, (_, i) => ({
            id: `tmdb:${200 + i}`,
            name: `Kids Movie ${i}`,
            type: 'movie',
            media_type: 'movie',
            genre_ids: [16, 10751], // Animation, Family
            keywords: [{ id: 1, name: 'safe' }]
        }));

        jest.spyOn(CatalogRouter, 'routeCatalogRequest').mockImplementation(async (args) => {
            const skip = args.extra?.skip || 0;
            if (skip === 0) return adultItems;
            if (skip === 20) return kidsItems;
            return [];
        });

        const userConfig = {
            userId: 'u_kids',
            addonUuid: 'uuid_kids',
            activeProfileId: 'p_kids',
            profiles: [{
                id: 'p_kids',
                settings: {
                    kidsMode: true,
                    typeSelectors: { film: false, serie: false, anime: null }
                }
            }],
            customCatalogs: [{
                id: 'custom_test_kids_movies',
                name: 'Custom Kids Test',
                type: 'movie'
            }],
            apiKeys: { tmdb: 'fake_key' }
        };

        const res = await catalogHandler(
            { id: 'custom_test_kids_movies', type: 'movie', extra: { skip: 0 } },
            userConfig,
            'http://localhost:7000'
        );

        expect(res.metas.length).toBe(20);
        expect(res.metas[0].name).toBe('Kids Movie 0');
        expect(res.metas[19].name).toBe('Kids Movie 19');
    });

    // =========================================================================
    // SITO 2: src/stremio/catalogHandler.js (animeSelector prima del taglio)
    // =========================================================================
    test('Sito 2: catalogHandler con animeSelector "only" restituisce 20 anime anche se i primi 20 sono occidentali', async () => {
        const nonAnimeItems = Array.from({ length: 20 }, (_, i) => ({
            id: `tmdb:${300 + i}`,
            name: `Western Movie ${i}`,
            type: 'movie',
            media_type: 'movie',
            _isAnime: false
        }));

        const animeItems = Array.from({ length: 20 }, (_, i) => ({
            id: `tmdb:${400 + i}`,
            name: `Anime Movie ${i}`,
            type: 'movie',
            media_type: 'movie',
            _isAnime: true
        }));

        jest.spyOn(CatalogRouter, 'routeCatalogRequest').mockImplementation(async (args) => {
            const skip = args.extra?.skip || 0;
            if (skip === 0) return nonAnimeItems;
            if (skip === 20) return animeItems;
            return [];
        });

        const userConfig = {
            userId: 'u_anime',
            addonUuid: 'uuid_anime',
            activeProfileId: 'p_anime',
            profiles: [{
                id: 'p_anime',
                settings: {
                    kidsMode: false,
                    typeSelectors: { film: false, serie: false, anime: 'only' }
                }
            }],
            customCatalogs: [{
                id: 'custom_test_anime_selector',
                name: 'Custom Anime Selector',
                type: 'movie',
                isAnime: true
            }],
            apiKeys: { tmdb: 'fake_key' }
        };

        const res = await catalogHandler(
            { id: 'custom_test_anime_selector', type: 'movie', extra: { skip: 0 } },
            userConfig,
            'http://localhost:7000'
        );

        expect(res.metas.length).toBe(20);
        expect(res.metas[0].name).toBe('Anime Movie 0');
        expect(res.metas[19].name).toBe('Anime Movie 19');
    });

    // =========================================================================
    // SITO 3: src/stremio/catalogHandler.js (isAnimeCatalog prima del taglio)
    // =========================================================================
    test('Sito 3: catalogHandler per catalogo anime restituisce 20 anime anche se i primi 20 della fonte non lo sono', async () => {
        const nonAnimeItems = Array.from({ length: 20 }, (_, i) => ({
            id: `tmdb:${500 + i}`,
            name: `Non Anime ${i}`,
            type: 'series',
            media_type: 'tv',
            _isAnime: false
        }));

        const animeItems = Array.from({ length: 20 }, (_, i) => ({
            id: `tmdb:${600 + i}`,
            name: `Real Anime ${i}`,
            type: 'series',
            media_type: 'tv',
            _isAnime: true
        }));

        jest.spyOn(CatalogRouter, 'routeCatalogRequest').mockImplementation(async (args) => {
            const skip = args.extra?.skip || 0;
            if (skip === 0) return nonAnimeItems;
            if (skip === 20) return animeItems;
            return [];
        });

        const userConfig = {
            userId: 'u_std',
            addonUuid: 'uuid_std',
            activeProfileId: 'p_std',
            profiles: [{
                id: 'p_std',
                settings: {
                    kidsMode: false,
                    typeSelectors: { film: false, serie: false, anime: null }
                }
            }],
            customCatalogs: [{
                id: 'custom_anime_direct',
                name: 'Custom Anime Direct',
                type: 'series',
                isAnime: true
            }],
            apiKeys: { tmdb: 'fake_key' }
        };

        const res = await catalogHandler(
            { id: 'custom_anime_direct', type: 'series', extra: { skip: 0 }, filters: { isAnime: true } },
            userConfig,
            'http://localhost:7000'
        );

        expect(res.metas.length).toBe(20);
        expect(res.metas[0].name).toBe('Real Anime 0');
        expect(res.metas[19].name).toBe('Real Anime 19');
    });

    // =========================================================================
    // SITO 4: src/stremio/providers/WatchlistProvider.js (Mongo limit prima del kids filter)
    // =========================================================================
    test('Sito 4: WatchlistProvider in kidsMode pagina MongoDB finché non raccoglie 20 elementi idonei', async () => {
        // 20 adult items + 20 kids items in Mongo
        const mongoDbItems = [
            ...Array.from({ length: 20 }, (_, i) => ({
                itemId: `tt_adult_${i}`,
                type: 'movie',
                name: `Adult Movie ${i}`,
                tmdbId: 550 // Fight Club (adult)
            })),
            ...Array.from({ length: 20 }, (_, i) => ({
                itemId: `tt_kids_${i}`,
                type: 'movie',
                name: `Kids Movie ${i}`,
                tmdbId: 862 // Toy Story (kids)
            }))
        ];

        jest.spyOn(UserLibraryItem, 'find').mockImplementation(() => ({
            sort: () => ({
                skip: (skipVal) => ({
                    limit: (limitVal) => ({
                        lean: async () => mongoDbItems.slice(skipVal, skipVal + limitVal)
                    })
                })
            })
        }));

        jest.spyOn(duckDbStore, 'query').mockImplementation(async (sql) => {
            if (!sql.includes('FROM movies')) return [];
            return [
                {
                    id: 550n,
                    title: 'Fight Club',
                    genres: JSON.stringify([{ id: 53, name: 'Thriller' }]),
                    keywords: JSON.stringify([{ id: 818, name: 'fight' }])
                },
                {
                    id: 862n,
                    title: 'Toy Story',
                    genres: JSON.stringify([{ id: 16, name: 'Animation' }, { id: 10751, name: 'Family' }]),
                    keywords: JSON.stringify([{ id: 1, name: 'safe' }])
                }
            ];
        });

        const userConfig = { addonUuid: 'sim-uuid' };
        const activeProfileSettings = { kidsMode: true };

        const metas = await getWatchlistCatalog(
            'yaca_watchlist_movies',
            'movie',
            0,
            userConfig,
            activeProfileSettings
        );

        // Nel vecchio codice: limit(20) estraeva solo i primi 20 (tutti adulti),
        // che venivano poi scartati lasciando 0 card.
        // Nel nuovo codice: la paginazione continua su Mongo fino a riempire 20 card idonee.
        expect(metas.length).toBe(20);
        expect(metas[0].id).toBe('tt_kids_0');
        expect(metas[19].id).toBe('tt_kids_19');
    });

    // =========================================================================
    // SITO 5: src/pool/composer.js (fetchFallbackRows prima del taglio)
    // =========================================================================
    test('Sito 5: fetchFallbackRows in kidsMode pagina DuckDB e restituisce 20 righe idonee', async () => {
        const duckDbRows = [
            ...Array.from({ length: 20 }, (_, i) => ({
                id: 1000 + i,
                title: `Adult Duck ${i}`,
                genre_ids: [53],
                keywords: [{ id: 10292 }]
            })),
            ...Array.from({ length: 20 }, (_, i) => ({
                id: 2000 + i,
                title: `Kids Duck ${i}`,
                genre_ids: [16, 10751],
                keywords: [{ id: 1 }]
            }))
        ];

        jest.spyOn(indice, 'getCatalogFromFilters').mockImplementation(async (filters, type, offset, batchSize) => {
            return duckDbRows.slice(offset, offset + batchSize);
        });

        const rows = await composer.fetchPopularFallbackIds('fake_key', 'movie', 20, true, null);

        // Nel vecchio codice: fetchLimit estraeva solo le prime 20/40 righe una tantum
        // Nel nuovo codice: pagina DuckDB finché non trova 20 elementi idonei
        expect(rows.length).toBe(20);
        expect(rows[0]).toBe('2000');
        expect(rows[19]).toBe('2019');
    });

    // =========================================================================
    // SITO 6: src/stremio/idratazione.js & hybridServing.js (candidati e top-up)
    // =========================================================================
    test('Sito 6: idrataEImpaginaCandidati estrae fino a 20 card idonee anche se i primi 20 candidati vengono decimati', async () => {
        // 20 candidati adulti (id: 100..119) + 20 candidati kids (id: 200..219)
        const candidates = [
            ...Array.from({ length: 20 }, (_, i) => 100 + i),
            ...Array.from({ length: 20 }, (_, i) => 200 + i)
        ];

        jest.spyOn(idratazione, 'resolveCardDetails').mockImplementation(async (recItem) => {
            const id = typeof recItem === 'object' && recItem !== null ? (recItem.id ?? recItem.tmdbId) : recItem;
            const numId = Number(id);
            if (numId < 200) {
                // Ineligible (adult)
                return {
                    id: `tmdb:${numId}`,
                    name: `Adult Card ${numId}`,
                    type: 'movie',
                    genre_ids: [53, 27],
                    keywords: [{ id: 10292 }]
                };
            }
            // Eligible (kids)
            return {
                id: `tmdb:${numId}`,
                name: `Kids Card ${numId}`,
                type: 'movie',
                genre_ids: [16, 10751],
                keywords: [{ id: 1 }]
            };
        });

        const cards = await idratazione.idrataEImpaginaCandidati({
            recommendationIds: candidates,
            skip: 0,
            limit: 20,
            tmdbApiKey: 'fake_key',
            mediaType: 'movie',
            isKidsMode: true
        });

        // Nel vecchio codice: se un pool di candidati veniva potato a valle, la riga era vuota.
        // Nel nuovo codice: itera i chunk dei candidati fino al target di 20 idonei
        expect(cards.length).toBe(20);
        expect(cards[0].id).toBe('tmdb:200');
        expect(cards[19].id).toBe('tmdb:219');
    });
});
