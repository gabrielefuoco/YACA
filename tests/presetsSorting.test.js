const { getPresets } = require('../src/data/presets');
const { mapSortBy, SUPPORTED_SORT_BY, isMappedSortBy } = require('../src/catalog/providers/DuckDbProvider');
const { S } = require('../src/data/filters');
const stremioRouter = require('../src/api/stremio');
const UserConfig = require('../src/models/UserConfig');

describe('Preset Sorting, Coverage and Simulcast Data-Driven Rule', () => {
    const presets = getPresets();

    test('All presets in presets.js define valid orderBy except airing_state (simulcast)', () => {
        expect(presets.length).toBeGreaterThan(0);

        for (const preset of presets) {
            if (preset._provider === 'airing_state' || preset.id === 'preset_anime_simulcast') {
                // Simulcast uses external state (anime_airing_state), ordered by episode release
                expect(preset.orderBy).toBeUndefined();
                expect(preset.where).toBeUndefined();
                expect(preset.sortable).toBe(false);
            } else {
                expect(typeof preset.orderBy).toBe('string');
                expect(preset.orderBy.trim().length).toBeGreaterThan(0);
                expect(preset.orderBy).toMatch(/DESC|ASC/);
                expect(preset.sortable).not.toBe(false);
            }
        }
    });

    test('mapSortBy covers ALL sort_by used across presets.js (fails if unmapped sort_by is added)', () => {
        const usedSortBys = new Set();
        for (const preset of presets) {
            for (const q of (preset.queries || [])) {
                if (q.sort_by) {
                    usedSortBys.add(q.sort_by);
                }
            }
        }

        // Ensure we actually found sort_by parameters in presets
        expect(usedSortBys.size).toBeGreaterThan(0);

        // Every sort_by used in presets must be explicitly mapped in SUPPORTED_SORT_BY
        for (const sortBy of usedSortBys) {
            expect(SUPPORTED_SORT_BY).toContain(sortBy);
            expect(isMappedSortBy(sortBy)).toBe(true);

            // Must produce non-empty valid SQL order expressions
            const movieOrder = mapSortBy(sortBy, 'movie');
            const seriesOrder = mapSortBy(sortBy, 'series');
            expect(typeof movieOrder).toBe('string');
            expect(movieOrder.trim().length).toBeGreaterThan(0);
            expect(typeof seriesOrder).toBe('string');
            expect(seriesOrder.trim().length).toBeGreaterThan(0);
        }
    });

    test('Guard-rail: isMappedSortBy returns false for unmapped sort fields', () => {
        expect(isMappedSortBy('non_existent.desc')).toBe(false);
        expect(isMappedSortBy('budget.asc')).toBe(false);
        expect(isMappedSortBy('')).toBe(false);
        expect(isMappedSortBy(null)).toBe(false);
        expect(isMappedSortBy(undefined)).toBe(false);
    });

    test('mapSortBy correctly maps sort_by to SQL expressions for movie vs series', () => {
        // Popularity
        expect(mapSortBy('popularity.desc', 'movie')).toBe(S.POPULAR);
        expect(mapSortBy('popularity.desc', 'series')).toBe(S.POPULAR);

        // Score (vote_average)
        expect(mapSortBy('vote_average.desc', 'movie')).toBe(S.TOP_RATED);
        expect(mapSortBy('vote_average.desc', 'series')).toBe(S.TOP_RATED);

        // Revenue (box office: movie only; series falls back safely to popularity)
        expect(mapSortBy('revenue.desc', 'movie')).toBe(S.REVENUE);
        expect(mapSortBy('revenue.desc', 'series')).toBe(S.POPULAR);

        // Release dates (movie release_date vs series first_air_date)
        expect(mapSortBy('primary_release_date.desc', 'movie')).toBe(S.NEWEST_MOVIE);
        expect(mapSortBy('primary_release_date.desc', 'series')).toBe(S.NEWEST_TV);
        expect(mapSortBy('release_date.desc', 'movie')).toBe(S.NEWEST_MOVIE);
        expect(mapSortBy('first_air_date.desc', 'series')).toBe(S.NEWEST_TV);

        // Ascending dates
        expect(mapSortBy('primary_release_date.asc', 'movie')).toBe('"release_date" ASC NULLS LAST');
        expect(mapSortBy('first_air_date.asc', 'series')).toBe('"first_air_date" ASC NULLS LAST');

        // Default / empty
        expect(mapSortBy(null, 'movie')).toBe(S.POPULAR);
        expect(mapSortBy(undefined, 'series')).toBe(S.POPULAR);
    });

    describe('Stremio Catalog Extra & Simulcast manifest', () => {
        const { getCatalogExtra, defaultExtra, presetExtra } = stremioRouter;

        test('getCatalogExtra returns defaultExtra (no sortBy) for airing_state / non-sortable catalogs', () => {
            // By id of canonical preset
            expect(getCatalogExtra({ id: 'preset_anime_simulcast' })).toEqual(defaultExtra);
            expect(getCatalogExtra({ id: 'yaca_preset_preset_anime_simulcast' })).toEqual(defaultExtra);

            // By data-driven property _provider
            expect(getCatalogExtra({ id: 'custom_airing', _provider: 'airing_state' })).toEqual(defaultExtra);
            expect(getCatalogExtra({ id: 'legacy_airing', _provider: 'anilist_simulcast' })).toEqual(defaultExtra);

            // By data-driven property sortable === false
            expect(getCatalogExtra({ id: 'custom_fixed_order', sortable: false })).toEqual(defaultExtra);

            // No sortBy in defaultExtra
            expect(defaultExtra.find(e => e.name === 'sortBy')).toBeUndefined();
            expect(defaultExtra).toEqual([{ name: 'skip' }]);
        });

        test('getCatalogExtra returns presetExtra (with sortBy) for standard presets', () => {
            const standardPreset = getCatalogExtra({ id: 'preset_pop_movies', name: 'Film Popolari', type: 'movie' });
            expect(standardPreset).toEqual(presetExtra);
            expect(standardPreset.find(e => e.name === 'sortBy')).toBeDefined();
            expect(standardPreset.find(e => e.name === 'sortBy').options).toEqual([
                'Popolarità', 'Voto Medio', 'Data di Uscita', 'Incassi'
            ]);
        });

        test('dynamic manifest excludes sortBy from preset_anime_simulcast and preserves other catalogs', async () => {
            const spy = jest.spyOn(UserConfig, 'resolveUserConfig').mockResolvedValueOnce({
                activeProfileId: 'p_test',
                profiles: [{
                    id: 'p_test',
                    name: 'Test Profile',
                    catalogs: [
                        { id: 'preset_anime_simulcast', name: 'Simulcast (Nuovi Episodi)', type: 'series', _provider: 'airing_state' },
                        { id: 'preset_pop_movies', name: 'Film Popolari', type: 'movie' }
                    ]
                }]
            });

            const manifestRoute = stremioRouter.stack.find(
                layer => layer.route && layer.route.path &&
                (Array.isArray(layer.route.path) ? layer.route.path.includes('/:userHandle/manifest.json') : layer.route.path === '/:userHandle/manifest.json')
            );

            let manifestJson = null;
            const req = { params: { userHandle: 'testSimulcast' }, protocol: 'http', get: () => 'localhost' };
            const res = {
                setHeader: () => {},
                json: (data) => { manifestJson = data; }
            };

            await manifestRoute.route.stack[0].handle(req, res);
            spy.mockRestore();

            expect(manifestJson).toBeDefined();

            // 1. Simulcast catalog MUST NOT have sortBy extra
            const simulcastCat = manifestJson.catalogs.find(c => c.id === 'preset_anime_simulcast');
            expect(simulcastCat).toBeDefined();
            expect(simulcastCat.extra).toEqual([{ name: 'skip' }]);
            expect(simulcastCat.extra.find(e => e.name === 'sortBy')).toBeUndefined();

            // 2. Standard user preset MUST retain sortBy extra
            const popMoviesCat = manifestJson.catalogs.find(c => c.id === 'preset_pop_movies');
            expect(popMoviesCat).toBeDefined();
            expect(popMoviesCat.extra).toEqual(presetExtra);
            expect(popMoviesCat.extra.find(e => e.name === 'sortBy')).toBeDefined();

            // 3. Hero catalogs MUST NOT have sortBy extra
            const heroCats = manifestJson.catalogs.filter(c => c.id.startsWith('yaca_true_blend_') || c.id.startsWith('yaca_seed_network_'));
            expect(heroCats.length).toBeGreaterThan(0);
            for (const hCat of heroCats) {
                expect(hCat.extra).toEqual([{ name: 'skip' }]);
                expect(hCat.extra.find(e => e.name === 'sortBy')).toBeUndefined();
            }

            // 4. Watchlist catalogs MUST NOT have sortBy extra
            const watchlistCats = manifestJson.catalogs.filter(c => c.id.startsWith('yaca_watchlist_'));
            expect(watchlistCats.length).toBeGreaterThan(0);
            for (const wCat of watchlistCats) {
                expect(wCat.extra).toEqual([{ name: 'skip' }]);
            }
        });
    });
});
