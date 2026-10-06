const { getPresets } = require('../src/data/presets');
const { mapSortBy, SUPPORTED_SORT_BY, isMappedSortBy } = require('../src/catalog/providers/DuckDbProvider');
const {
    FAMILY_SORT_DEFAULTS,
    SORT_OPTIONS,
    USER_SORT_MAP,
    translateSort,
    getSortComparator,
    getSortByValue,
    isCatalogSortable,
    extractSecondaryTieBreakers,
    applySortWithTieBreakers
} = require('../src/catalog/catalogSorting');
const { routeCatalogRequest } = require('../src/catalog/CatalogRouter');
const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');
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

    describe('Unified Sorting Vocabulary & Family Defaults (Ticket 18)', () => {
        test('FAMILY_SORT_DEFAULTS documents the 4 families (discovery, simulcast, watchlist, hero)', () => {
            expect(FAMILY_SORT_DEFAULTS).toBeDefined();
            expect(Object.keys(FAMILY_SORT_DEFAULTS).sort()).toEqual(['discovery', 'hero', 'simulcast', 'watchlist'].sort());

            // Discovery family
            expect(FAMILY_SORT_DEFAULTS.discovery.sort).toBe('popularity.desc');
            expect(FAMILY_SORT_DEFAULTS.discovery.sql).toBe(S.POPULAR);
            expect(FAMILY_SORT_DEFAULTS.discovery.sortable).toBe(true);

            // Simulcast family
            expect(FAMILY_SORT_DEFAULTS.simulcast.sort).toBe('lastAiredAt');
            expect(FAMILY_SORT_DEFAULTS.simulcast.sortable).toBe(false);

            // Watchlist family
            expect(FAMILY_SORT_DEFAULTS.watchlist.sort).toBe('_mtime DESC');
            expect(FAMILY_SORT_DEFAULTS.watchlist.mongoSort).toEqual({ _mtime: -1, itemId: 1 });
            expect(FAMILY_SORT_DEFAULTS.watchlist.sortable).toBe(false);

            // Hero family
            expect(FAMILY_SORT_DEFAULTS.hero.sort).toBe('affinity_score');
            expect(FAMILY_SORT_DEFAULTS.hero.sortable).toBe(false);
        });

        test('DNA affinity is strictly an internal reranker (NO "Per te" in user vocabulary)', () => {
            expect(SORT_OPTIONS).not.toContain('Per te');
            expect(SORT_OPTIONS).not.toContain('Per Te');
            expect(SORT_OPTIONS).not.toContain('DNA');
            expect(SORT_OPTIONS).toEqual(['Popolarità', 'Voto Medio', 'Data di Uscita', 'Incassi']);
        });

        test('translateSort maps user options to SQL, comparator, canonical key and tmdb sort_by', () => {
            // Popolarità
            const pop = translateSort('Popolarità', 'movie');
            expect(pop.sql).toBe(S.POPULAR);
            expect(pop.canonicalKey).toBe('POPULARITY_DESC');
            expect(pop.tmdbSortBy).toBe('popularity.desc');
            expect(typeof pop.comparator).toBe('function');
            expect(pop.comparator({ popularity: 10 }, { popularity: 20 })).toBeGreaterThan(0);

            // Voto Medio
            const vote = translateSort('Voto Medio', 'movie');
            expect(vote.sql).toBe(S.TOP_RATED);
            expect(vote.canonicalKey).toBe('RATING_DESC');
            expect(vote.tmdbSortBy).toBe('vote_average.desc');
            expect(vote.comparator({ vote_average: 7.5, vote_count: 100 }, { vote_average: 8.5, vote_count: 100 })).toBeGreaterThan(0);

            // Data di Uscita (movie vs tv)
            const dateMovie = translateSort('Data di Uscita', 'movie');
            expect(dateMovie.sql).toBe(S.NEWEST_MOVIE);
            expect(dateMovie.canonicalKey).toBe('RELEASE_DATE_DESC');
            expect(dateMovie.tmdbSortBy).toBe('primary_release_date.desc');

            const dateTv = translateSort('Data di Uscita', 'series');
            expect(dateTv.sql).toBe(S.NEWEST_TV);
            expect(dateTv.canonicalKey).toBe('RELEASE_DATE_DESC');
            expect(dateTv.tmdbSortBy).toBe('first_air_date.desc');

            // Incassi (movie vs tv)
            const revMovie = translateSort('Incassi', 'movie');
            expect(revMovie.sql).toBe(S.REVENUE);
            expect(revMovie.canonicalKey).toBe('REVENUE_DESC');
            expect(revMovie.tmdbSortBy).toBe('revenue.desc');

            const revTv = translateSort('Incassi', 'series');
            expect(revTv.sql).toBe(S.POPULAR);
            expect(revTv.canonicalKey).toBe('REVENUE_DESC');

            // Fallback / default
            expect(translateSort(null, 'movie').sql).toBe(S.POPULAR);
            expect(translateSort(undefined, 'series').sql).toBe(S.POPULAR);
        });

        test('isCatalogSortable flags non-sortable catalogs according to family specifications', () => {
            expect(isCatalogSortable({ id: 'preset_anime_simulcast' })).toBe(false);
            expect(isCatalogSortable({ id: 'yaca_preset_preset_anime_simulcast' })).toBe(false);
            expect(isCatalogSortable({ _provider: 'airing_state' })).toBe(false);
            expect(isCatalogSortable({ id: 'yaca_watchlist_movies' })).toBe(false);
            expect(isCatalogSortable({ id: 'yaca_watchlist_series' })).toBe(false);
            expect(isCatalogSortable({ id: 'yaca_watchlist_anime' })).toBe(false);
            expect(isCatalogSortable({ id: 'yaca_true_blend_movies' })).toBe(false);
            expect(isCatalogSortable({ id: 'yaca_seed_network_series' })).toBe(false);
            expect(isCatalogSortable({ id: 'preset_pop_movies' })).toBe(true);
            expect(isCatalogSortable({ id: 'custom_fixed', sortable: false })).toBe(false);
        });
    });

    describe('Tie-Breaker Preservation (Bugfix Ticket 18)', () => {
        test('extractSecondaryTieBreakers accurately parses preset tie-breakers', () => {
            const presetBurton = presets.find(p => p.id === 'preset_burton');
            expect(presetBurton).toBeDefined();

            const tieBreakers = extractSecondaryTieBreakers(presetBurton, 'movie');
            expect(tieBreakers).toEqual(['"vote_count" DESC', '"id" ASC']);

            const normalPreset = presets.find(p => p.id === 'preset_pop_movies');
            expect(extractSecondaryTieBreakers(normalPreset, 'movie')).toEqual([]);

            const explicitPreset = {
                id: 'custom',
                orderBy: '"popularity" DESC NULLS LAST',
                tieBreakers: ['"vote_count" DESC', '"id" ASC']
            };
            expect(extractSecondaryTieBreakers(explicitPreset, 'movie')).toEqual(['"vote_count" DESC', '"id" ASC']);
        });

        test('applySortWithTieBreakers preserves secondary tie-breakers across different sortBy choices', () => {
            const presetBurton = presets.find(p => p.id === 'preset_burton');

            // 1. Changing to release_date.desc MUST keep vote_count DESC and id ASC
            const orderRelease = applySortWithTieBreakers(presetBurton, 'primary_release_date.desc', 'movie');
            expect(orderRelease).toBe(`${S.NEWEST_MOVIE}, "vote_count" DESC, "id" ASC`);

            // 2. Changing to vote_average.desc MUST not duplicate vote_count DESC and keep id ASC
            const orderRating = applySortWithTieBreakers(presetBurton, 'vote_average.desc', 'movie');
            expect(orderRating).toBe(`${S.TOP_RATED}, "id" ASC`);

            // 3. Changing to popularity.desc (or selecting Popolarità in UI) MUST NOT flatten tie-breakers
            const orderPop = applySortWithTieBreakers(presetBurton, 'popularity.desc', 'movie');
            expect(orderPop).toBe(presetBurton.orderBy);

            // 4. Changing to revenue.desc
            const orderRev = applySortWithTieBreakers(presetBurton, 'revenue.desc', 'movie');
            expect(orderRev).toBe(`${S.REVENUE}, "vote_count" DESC, "id" ASC`);
        });

        test('applySortWithTieBreakers leaves standard presets and sortable:false unchanged', () => {
            const normalPreset = presets.find(p => p.id === 'preset_pop_movies');
            const orderNormal = applySortWithTieBreakers(normalPreset, 'vote_average.desc', 'movie');
            expect(orderNormal).toBe(S.TOP_RATED);

            const fixedPreset = {
                id: 'fixed',
                orderBy: '"custom_col" ASC',
                sortable: false
            };
            const orderFixed = applySortWithTieBreakers(fixedPreset, 'popularity.desc', 'movie');
            expect(orderFixed).toBe('"custom_col" ASC');
        });

        test('CatalogRouter scenario 5 preserves tie-breakers when executing preset with sortBy', async () => {
            const presetBurton = presets.find(p => p.id === 'preset_burton');
            let executedPreset = null;

            const spy = jest.spyOn(DuckDbProvider, 'getDuckDbCatalogFromPreset').mockImplementation(async (preset) => {
                executedPreset = preset;
                return [{ id: 'tt123', name: 'Batman' }];
            });

            // Call CatalogRouter with preset_burton and sortBy = primary_release_date.desc
            await routeCatalogRequest({
                id: presetBurton.id,
                type: 'movie',
                extra: { sortBy: 'primary_release_date.desc' }
            }, {}, {});

            expect(executedPreset).toBeDefined();
            // Verify that secondary tie-breakers were NOT discarded:
            expect(executedPreset.orderBy).toBe(`${S.NEWEST_MOVIE}, "vote_count" DESC, "id" ASC`);

            // Call with sortBy = popularity.desc (the exact bug in ticket 18: previously reset to S.POPULAR alone)
            await routeCatalogRequest({
                id: presetBurton.id,
                type: 'movie',
                extra: { sortBy: 'popularity.desc' }
            }, {}, {});

            expect(executedPreset.orderBy).toBe(presetBurton.orderBy);

            spy.mockRestore();
        });
    });
});
