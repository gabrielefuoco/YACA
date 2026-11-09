// tests/shelvesResolverCacheAndModes.test.js

const {
    getCachedProfileShelves,
    setCachedProfileShelves,
    clearCachedProfileShelves
} = require('../src/pool');
const { resolveProfileShelves } = require('../src/stremio/shelvesResolver');
const { graphClient } = require('../src/clients');
const library = require('../src/library');
const { shelvesCache } = require('../src/cache/cacheInstances');

describe('shelvesResolver & pool cache invariant (Ticket V45)', () => {
    const testProfileId = 'test_prof_cache_v45';
    const testUserId = 'test_user_cache_v45';

    const sampleUserConfig = {
        userId: testUserId,
        activeProfileId: testProfileId,
        profiles: [
            {
                id: testProfileId,
                name: 'Test Profile',
                settings: {}
            }
        ]
    };

    let originalScaffali;
    let originalSemiDi;

    beforeEach(() => {
        clearCachedProfileShelves();
        shelvesCache.clear();
        originalScaffali = graphClient.scaffali;
        originalSemiDi = library.semiDi;
    });

    afterEach(() => {
        graphClient.scaffali = originalScaffali;
        library.semiDi = originalSemiDi;
        clearCachedProfileShelves();
        shelvesCache.clear();
    });

    test('invariant: cache stores per medium and preserves other medium on partial writes', () => {
        const movieShelf = [{ catalog_id: 'yaca_100_movie', medium: 'movie', nome: 'Film 100' }];
        const seriesShelf = [{ catalog_id: 'yaca_200_series', medium: 'series', nome: 'Serie 200' }];

        // Write movie
        setCachedProfileShelves(testProfileId, movieShelf, 'movie');
        expect(getCachedProfileShelves(testProfileId, 'movie')).toHaveLength(1);
        expect(getCachedProfileShelves(testProfileId, 'series')).toBeNull();
        expect(getCachedProfileShelves(testProfileId)).toHaveLength(1);

        // Write series: must NOT overwrite movie!
        setCachedProfileShelves(testProfileId, seriesShelf, 'series');
        expect(getCachedProfileShelves(testProfileId, 'movie')).toHaveLength(1);
        expect(getCachedProfileShelves(testProfileId, 'series')).toHaveLength(1);
        expect(getCachedProfileShelves(testProfileId)).toHaveLength(2);

        // Overwrite movie only: series remains preserved
        const updatedMovie = [{ catalog_id: 'yaca_101_movie', medium: 'movie', nome: 'Film 101' }];
        setCachedProfileShelves(testProfileId, updatedMovie, 'movie');
        expect(getCachedProfileShelves(testProfileId, 'movie')[0].catalog_id).toBe('yaca_101_movie');
        expect(getCachedProfileShelves(testProfileId, 'series')[0].catalog_id).toBe('yaca_200_series');
        expect(getCachedProfileShelves(testProfileId)).toHaveLength(2);
    });

    test('partial cache (only movie cached): resolver still returns both media', async () => {
        // Pre-fill cache with only movie shelves
        const movieShelves = [
            { catalog_id: 'yaca_872585_movie', medium: 'movie', nome: 'Oppenheimer', slot: 1 },
            { catalog_id: 'yaca_671_movie', medium: 'movie', nome: 'Harry Potter', slot: 2 }
        ];
        setCachedProfileShelves(testProfileId, movieShelves, 'movie');

        // Mock library.semiDi
        library.semiDi = jest.fn().mockImplementation(async ({ mediaType }) => {
            const id = mediaType === 'movie' ? 872585 : 1399;
            return {
                seeds: new Map([[id, 1.0]]),
                tipi: new Map([[id, 'watched']]),
                ultimaVisione: new Map(),
                plays: new Map()
            };
        });

        // Mock graphClient.scaffali: should only be invoked for series!
        const scaffaliCalls = [];
        graphClient.scaffali = jest.fn().mockImplementation(async (semi, opts) => {
            scaffaliCalls.push(opts.medium);
            if (opts.medium === 'series') {
                return {
                    scaffali: [
                        { catalog_id: 'yaca_1399_series', medium: 'series', nome: 'Game of Thrones', slot: 1 },
                        { catalog_id: 'yaca_66732_series', medium: 'series', nome: 'Stranger Things', slot: 2 }
                    ]
                };
            }
            return { scaffali: [] };
        });

        const result = await resolveProfileShelves({ userConfig: sampleUserConfig, profileId: testProfileId });

        // Must return all 4 shelves with sequential slots 1..4
        expect(result).toHaveLength(4);
        expect(result.map(s => s.catalog_id)).toEqual([
            'yaca_872585_movie',
            'yaca_671_movie',
            'yaca_1399_series',
            'yaca_66732_series'
        ]);
        expect(result.map(s => s.slot)).toEqual([1, 2, 3, 4]);

        // Scaffali must NOT have been called for movie (it was cached)
        expect(scaffaliCalls).toEqual(['series']);

        // Now series must also be in cache
        const cachedSeries = getCachedProfileShelves(testProfileId, 'series');
        expect(cachedSeries).toHaveLength(2);
        expect(cachedSeries[0].catalog_id).toBe('yaca_1399_series');

        // Complete cache now has 4 items
        expect(getCachedProfileShelves(testProfileId)).toHaveLength(4);
    });

    test('full cache case: does not regress (0 graph calls, returns both media)', async () => {
        // Pre-fill both movie and series
        const movieShelves = [{ catalog_id: 'yaca_1_movie', medium: 'movie', nome: 'Film 1' }];
        const seriesShelves = [{ catalog_id: 'yaca_2_series', medium: 'series', nome: 'Serie 2' }];
        setCachedProfileShelves(testProfileId, movieShelves, 'movie');
        setCachedProfileShelves(testProfileId, seriesShelves, 'series');

        graphClient.scaffali = jest.fn();
        library.semiDi = jest.fn();

        const result = await resolveProfileShelves({ userConfig: sampleUserConfig, profileId: testProfileId });

        expect(result).toHaveLength(2);
        expect(result[0].catalog_id).toBe('yaca_1_movie');
        expect(result[0].slot).toBe(1);
        expect(result[1].catalog_id).toBe('yaca_2_series');
        expect(result[1].slot).toBe(2);

        // Neither graphClient nor semiDi should be touched
        expect(graphClient.scaffali).not.toHaveBeenCalled();
        expect(library.semiDi).not.toHaveBeenCalled();
    });

    test('cold start: fetches and caches both media in parallel', async () => {
        library.semiDi = jest.fn().mockImplementation(async ({ mediaType }) => {
            const id = mediaType === 'movie' ? 10 : 20;
            return {
                seeds: new Map([[id, 1.0]]),
                tipi: new Map([[id, 'watched']]),
                ultimaVisione: new Map(),
                plays: new Map()
            };
        });

        graphClient.scaffali = jest.fn().mockImplementation(async (semi, opts) => ({
            scaffali: [
                { catalog_id: `yaca_seed_${opts.medium}`, medium: opts.medium, nome: `Shelf ${opts.medium}` }
            ]
        }));

        const result = await resolveProfileShelves({ userConfig: sampleUserConfig, profileId: testProfileId });

        expect(result).toHaveLength(2);
        expect(result.map(s => s.catalog_id)).toEqual(['yaca_seed_movie', 'yaca_seed_series']);
        expect(result.map(s => s.slot)).toEqual([1, 2]);

        // Both media now cached
        expect(getCachedProfileShelves(testProfileId, 'movie')).toHaveLength(1);
        expect(getCachedProfileShelves(testProfileId, 'series')).toHaveLength(1);
    });

    test('mode wiring: resolver reads anime policy and kids mode from active mode', async () => {
        const originalModiEnv = process.env.MODI_ABILITATI;
        process.env.MODI_ABILITATI = '1';

        try {
            // User config with activeModo: 'anime'
            const animeUserConfig = {
                userId: 'anime_user',
                activeModo: 'anime',
                config: {
                    activeModo: 'anime'
                },
                profiles: [
                    {
                        id: 'modo_anime',
                        modo: 'anime',
                        name: 'Anime',
                        settings: {
                            // old settings are neutral; must NOT be used
                            typeSelectors: { anime: null }
                        }
                    }
                ]
            };

            library.semiDi = jest.fn().mockImplementation(async () => ({
                seeds: new Map([[500, 1.0]]),
                tipi: new Map([[500, 'watched']]),
                ultimaVisione: new Map(),
                plays: new Map()
            }));

            let capturedOptions = null;
            graphClient.scaffali = jest.fn().mockImplementation(async (semi, opts) => {
                capturedOptions = opts.opzioni;
                return { scaffali: [] };
            });

            await resolveProfileShelves({ userConfig: animeUserConfig, profileId: 'modo_anime' });

            // The options passed to graphClient must have filtri.anime === 'only' derived from mode 'anime'
            expect(capturedOptions).toBeDefined();
            expect(capturedOptions.filtri?.anime).toBe('only');

            // User config with activeModo: 'bambini'
            const kidsUserConfig = {
                userId: 'kids_user',
                activeModo: 'bambini',
                config: {
                    activeModo: 'bambini'
                },
                profiles: [
                    {
                        id: 'modo_bambini',
                        modo: 'bambini',
                        name: 'Bambini',
                        settings: {
                            kidsMode: false // old settings must NOT override mode
                        }
                    }
                ]
            };

            capturedOptions = null;
            await resolveProfileShelves({ userConfig: kidsUserConfig, profileId: 'modo_bambini' });
            expect(capturedOptions).toBeDefined();
            expect(capturedOptions.filtri?.kids).toBe(true);
            expect(capturedOptions.kids).toBe(true);
        } finally {
            process.env.MODI_ABILITATI = originalModiEnv;
        }
    });
});

describe('La cache in RAM non mescola le modalità', () => {
    // Le cinque modalità condividono lo stesso userId: la cache per (profilo, medium)
    // restituiva in una modalità gli scaffali costruiti da un'altra, quindi cataloghi
    // elencati e poi vuoti al serving.
    it('la chiave della cache porta la modalità, ma solo a flag acceso', () => {
        const { chiaveCacheScaffali } = require('../src/cache/shelfKey');

        process.env.MODI_ABILITATI = '1';
        expect(chiaveCacheScaffali('REOZrGNRr3', { activeModo: 'film' })).toBe('REOZrGNRr3::film');
        expect(chiaveCacheScaffali('REOZrGNRr3', { activeModo: 'serie' })).toBe('REOZrGNRr3::serie');

        process.env.MODI_ABILITATI = '0';
        expect(chiaveCacheScaffali('REOZrGNRr3', { activeModo: 'film' })).toBe('REOZrGNRr3');
        process.env.MODI_ABILITATI = '1';
    });
});
