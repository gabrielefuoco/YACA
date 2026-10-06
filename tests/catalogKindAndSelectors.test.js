const { getCatalogKind, isCatalogConformant, getIncompatibilityReason, isAlwaysVisible } = require('../src/catalog/catalogKind');
const { buildManifest } = require('../src/api/stremio');
const { catalogHandler } = require('../src/handlers/catalogHandler');

describe('TICKET 09: Selettori di tipo nel profilo (catalogKind, Manifest e Guardia)', () => {

    describe('1. catalogKind helper: classificazione kind', () => {
        it('identifica correttamente preset film non-anime', () => {
            const kind = getCatalogKind({ id: 'preset_pop_movies', type: 'movie' });
            expect(kind).toEqual({ mediaSet: ['film'], anime: 'no' });
        });

        it('identifica correttamente preset serie non-anime', () => {
            const kind = getCatalogKind({ id: 'preset_pop_series', type: 'series' });
            expect(kind).toEqual({ mediaSet: ['serie'], anime: 'no' });
        });

        it('identifica correttamente preset anime film (es. preset_ghibli o isAnime:true)', () => {
            const kind = getCatalogKind({ id: 'preset_ghibli', type: 'movie', isAnime: true });
            expect(kind).toEqual({ mediaSet: ['film'], anime: 'yes' });
        });

        it('identifica correttamente preset anime serie (es. preset_pop_anime)', () => {
            const kind = getCatalogKind({ id: 'preset_pop_anime', type: 'series', isAnime: true });
            expect(kind).toEqual({ mediaSet: ['serie'], anime: 'yes' });
        });

        it('identifica preset anime bambini basandosi su isAnime e NON sulla category', () => {
            // Bambini & Famiglia con isAnime: true
            const kind = getCatalogKind({
                id: 'preset_anime_kids_movies',
                category: '👨‍👩‍👧‍👦 Bambini & Famiglia',
                type: 'movie',
                isAnime: true
            });
            expect(kind).toEqual({ mediaSet: ['film'], anime: 'yes' });
        });

        it('identifica gli 8 hero catalogs dal registry esplicito (agnostici su anime)', () => {
            expect(getCatalogKind('yaca_true_blend_movies')).toEqual({ mediaSet: ['film'], anime: 'agnostic' });
            expect(getCatalogKind('yaca_true_blend_series')).toEqual({ mediaSet: ['serie'], anime: 'agnostic' });
            expect(getCatalogKind('yaca_seed_network_movies')).toEqual({ mediaSet: ['film'], anime: 'agnostic' });
            expect(getCatalogKind('yaca_seed_network_series')).toEqual({ mediaSet: ['serie'], anime: 'agnostic' });
            expect(getCatalogKind('yaca_hidden_gems_movies')).toEqual({ mediaSet: ['film'], anime: 'agnostic' });
            expect(getCatalogKind('yaca_hidden_gems_series')).toEqual({ mediaSet: ['serie'], anime: 'agnostic' });
            expect(getCatalogKind('yaca_trakt_filtered_movies')).toEqual({ mediaSet: ['film'], anime: 'agnostic' });
            expect(getCatalogKind('yaca_trakt_filtered_series')).toEqual({ mediaSet: ['serie'], anime: 'agnostic' });
        });

        it('identifica cataloghi custom / Matchmaker', () => {
            // custom anime -> mediaSet ignoto ['film', 'serie'], anime: 'yes'
            const customAnime = getCatalogKind({ id: 'custom_anime_1', type: 'anime' });
            expect(customAnime).toEqual({ mediaSet: ['film', 'serie'], anime: 'yes' });

            // custom movie non-anime
            const customMovie = getCatalogKind({ id: 'custom_movie_1', type: 'movie' });
            expect(customMovie).toEqual({ mediaSet: ['film'], anime: 'no' });

            // custom series anime
            const customSeriesAnime = getCatalogKind({ id: 'custom_series_1', type: 'series', isAnime: true });
            expect(customSeriesAnime).toEqual({ mediaSet: ['serie'], anime: 'yes' });
        });

        it('riconosce i cataloghi alwaysVisible (utility e libreria)', () => {
            expect(isAlwaysVisible('yaca_search_standard')).toBe(true);
            expect(isAlwaysVisible('yaca_search_ai')).toBe(true);
            expect(isAlwaysVisible('yaca_watchlist_movies')).toBe(true);
            expect(isAlwaysVisible('yaca_watchlist_series')).toBe(true);
            expect(isAlwaysVisible('yaca_watchlist_anime')).toBe(true);

            expect(isAlwaysVisible('preset_pop_movies')).toBe(false);
            expect(isAlwaysVisible('yaca_true_blend_movies')).toBe(false);
        });
    });

    describe('2. Matrice combinazioni (media × anime)', () => {
        // Campioni
        const movieNonAnime = { id: 'cat_movie_no', type: 'movie', isAnime: false };
        const seriesNonAnime = { id: 'cat_series_no', type: 'series', isAnime: false };
        const movieAnime = { id: 'cat_movie_yes', type: 'movie', isAnime: true };
        const seriesAnime = { id: 'cat_series_yes', type: 'series', isAnime: true };
        const mixedMerged = { id: 'cat_merged', mediaSet: ['film', 'serie'], anime: 'mixed' };
        const heroMovie = 'yaca_true_blend_movies';
        const heroSeries = 'yaca_true_blend_series';

        describe('Caso: nessun vincolo ({ film: false, serie: false, anime: null } o undefined)', () => {
            const selectors = { film: false, serie: false, anime: null };

            it('ammette tutti i tipi', () => {
                expect(isCatalogConformant(movieNonAnime, selectors)).toBe(true);
                expect(isCatalogConformant(seriesNonAnime, selectors)).toBe(true);
                expect(isCatalogConformant(movieAnime, selectors)).toBe(true);
                expect(isCatalogConformant(seriesAnime, selectors)).toBe(true);
                expect(isCatalogConformant(mixedMerged, selectors)).toBe(true);
                expect(isCatalogConformant(heroMovie, selectors)).toBe(true);
                expect(isCatalogConformant(heroSeries, selectors)).toBe(true);

                // retrocompat: null o undefined
                expect(isCatalogConformant(movieNonAnime, null)).toBe(true);
                expect(isCatalogConformant(seriesNonAnime, undefined)).toBe(true);
            });
        });

        describe('Caso: profili salvati con film/serie legacy ({ film: true, serie: false, anime: null } o { film: false, serie: true, anime: null })', () => {
            it('tollera i campi legacy senza errori e smette di filtrarli (ammette tutti i tipi)', () => {
                const legacyFilm = { film: true, serie: false, anime: null };
                expect(isCatalogConformant(movieNonAnime, legacyFilm)).toBe(true);
                expect(isCatalogConformant(seriesNonAnime, legacyFilm)).toBe(true);
                expect(isCatalogConformant(heroMovie, legacyFilm)).toBe(true);
                expect(isCatalogConformant(heroSeries, legacyFilm)).toBe(true);
                expect(getIncompatibilityReason(seriesNonAnime, legacyFilm)).toBeNull();

                const legacySerie = { film: false, serie: true, anime: null };
                expect(isCatalogConformant(movieNonAnime, legacySerie)).toBe(true);
                expect(isCatalogConformant(seriesNonAnime, legacySerie)).toBe(true);
                expect(isCatalogConformant(heroMovie, legacySerie)).toBe(true);
                expect(isCatalogConformant(heroSeries, legacySerie)).toBe(true);
                expect(getIncompatibilityReason(movieNonAnime, legacySerie)).toBeNull();
            });
        });

        describe('Caso: Solo Anime ({ anime: "only" })', () => {
            const selectors = { film: false, serie: false, anime: 'only' };

            it('ammette preset anime ed hero catalogs, esclude non-anime e misti', () => {
                expect(isCatalogConformant(movieAnime, selectors)).toBe(true);
                expect(isCatalogConformant(seriesAnime, selectors)).toBe(true);
                // Hero catalogs sono policy-agnostic sulla dimensione anime (Ticket 15)
                expect(isCatalogConformant(heroMovie, selectors)).toBe(true);
                expect(isCatalogConformant(heroSeries, selectors)).toBe(true);

                expect(isCatalogConformant(movieNonAnime, selectors)).toBe(false);
                expect(isCatalogConformant(seriesNonAnime, selectors)).toBe(false);
                expect(isCatalogConformant(mixedMerged, selectors)).toBe(false);
            });

            it('restituisce il motivo corretto', () => {
                expect(getIncompatibilityReason(movieNonAnime, selectors)).toBe('Non compatibile: profilo Solo Anime');
                expect(getIncompatibilityReason(seriesNonAnime, selectors)).toBe('Non compatibile: profilo Solo Anime');
                expect(getIncompatibilityReason(heroMovie, selectors)).toBeNull();
            });
        });

        describe('Caso: Solo Anime con residui legacy ({ film: false, serie: true, anime: "only" })', () => {
            const selectors = { film: false, serie: true, anime: 'only' };

            it('ammette sia film anime che serie anime ed hero (film/serie non vincolano)', () => {
                expect(isCatalogConformant(seriesAnime, selectors)).toBe(true);
                expect(isCatalogConformant(movieAnime, selectors)).toBe(true);
                expect(isCatalogConformant(heroMovie, selectors)).toBe(true);
                expect(isCatalogConformant(heroSeries, selectors)).toBe(true);

                expect(isCatalogConformant(seriesNonAnime, selectors)).toBe(false);
                expect(isCatalogConformant(movieNonAnime, selectors)).toBe(false);
                expect(isCatalogConformant(mixedMerged, selectors)).toBe(false);
            });
        });

        describe('Caso: No Anime ({ anime: "exclude" })', () => {
            const selectors = { film: false, serie: false, anime: 'exclude' };

            it('ammette tutti i non-anime ed hero catalogs, esclude anime e misti', () => {
                expect(isCatalogConformant(movieNonAnime, selectors)).toBe(true);
                expect(isCatalogConformant(seriesNonAnime, selectors)).toBe(true);
                expect(isCatalogConformant(heroMovie, selectors)).toBe(true);
                expect(isCatalogConformant(heroSeries, selectors)).toBe(true);

                expect(isCatalogConformant(movieAnime, selectors)).toBe(false);
                expect(isCatalogConformant(seriesAnime, selectors)).toBe(false);
                expect(isCatalogConformant(mixedMerged, selectors)).toBe(false); // mixed conformi solo con anime:null
            });

            it('restituisce il motivo corretto', () => {
                expect(getIncompatibilityReason(movieAnime, selectors)).toBe('Non compatibile: profilo No Anime');
                expect(getIncompatibilityReason(heroMovie, selectors)).toBeNull();
            });
        });
    });

    describe('3. buildManifest: filtraggio cataloghi attivi e hero', () => {
        const baseUserConfig = {
            userId: 'user_test_1',
            activeProfileId: 'p1',
            profiles: [
                {
                    id: 'p1',
                    name: 'Test Profile',
                    catalogs: [
                        { id: 'preset_pop_movies', name: 'Film Popolari', type: 'movie', isAnime: false },
                        { id: 'preset_pop_series', name: 'Serie Popolari', type: 'series', isAnime: false },
                        { id: 'preset_ghibli', name: 'Studio Ghibli', type: 'movie', isAnime: true },
                        { id: 'preset_pop_anime', name: 'Anime Popolari', type: 'series', isAnime: true }
                    ],
                    raw_ui_state: {
                        selectedPresets: [
                            'preset_pop_movies',
                            'preset_pop_series',
                            'preset_ghibli',
                            'preset_pop_anime',
                            'yaca_true_blend_movies',
                            'yaca_true_blend_series'
                        ]
                    },
                    settings: {}
                }
            ],
            customCatalogs: [
                { id: 'custom_anime_matchmaker', name: 'Matchmaker Anime', type: 'anime' }
            ]
        };

        it('Retrocompatibilità: profilo senza typeSelectors genera manifest completo identico a prima', () => {
            const manifest = buildManifest(baseUserConfig);
            const catalogIds = manifest.catalogs.map(c => c.id);

            // Ricerca e watchlist sempre presenti
            expect(catalogIds).toContain('yaca_search_standard');
            expect(catalogIds).toContain('yaca_search_ai');
            expect(catalogIds).toContain('yaca_watchlist_movies');
            expect(catalogIds).toContain('yaca_watchlist_series');
            expect(catalogIds).toContain('yaca_watchlist_anime');

            // Hero attivi presenti
            expect(catalogIds).toContain('yaca_true_blend_movies');
            expect(catalogIds).toContain('yaca_true_blend_series');

            // Presets utente presenti
            expect(catalogIds).toContain('preset_pop_movies');
            expect(catalogIds).toContain('preset_pop_series');
            expect(catalogIds).toContain('preset_ghibli');
            expect(catalogIds).toContain('preset_pop_anime');

            // Custom presente
            expect(catalogIds).toContain('custom_anime_matchmaker');
        });

        it('Profilo con residui legacy film/serie: genera manifest completo senza esclusioni improprie', () => {
            const configLegacy = JSON.parse(JSON.stringify(baseUserConfig));
            configLegacy.profiles[0].settings = {
                typeSelectors: { film: false, serie: true, anime: null }
            };

            const manifest = buildManifest(configLegacy);
            const catalogIds = manifest.catalogs.map(c => c.id);

            // Watchlist resta sempre presente
            expect(catalogIds).toContain('yaca_watchlist_movies');
            expect(catalogIds).toContain('yaca_watchlist_series');
            expect(catalogIds).toContain('yaca_watchlist_anime');

            // Hero entrambi presenti (film e serie non vengono più esclusi)
            expect(catalogIds).toContain('yaca_true_blend_series');
            expect(catalogIds).toContain('yaca_true_blend_movies');

            // Presets: sia film che serie presenti
            expect(catalogIds).toContain('preset_pop_series');
            expect(catalogIds).toContain('preset_pop_anime');
            expect(catalogIds).toContain('preset_pop_movies');
            expect(catalogIds).toContain('preset_ghibli');
        });

        it('Profilo "Solo Anime": include hero movies e series, include preset anime, esclude preset non-anime', () => {
            const configSoloAnime = JSON.parse(JSON.stringify(baseUserConfig));
            configSoloAnime.profiles[0].settings = {
                typeSelectors: { film: false, serie: false, anime: 'only' }
            };

            const manifest = buildManifest(configSoloAnime);
            const catalogIds = manifest.catalogs.map(c => c.id);

            // Watchlist resta sempre presente
            expect(catalogIds).toContain('yaca_watchlist_movies');
            expect(catalogIds).toContain('yaca_watchlist_series');
            expect(catalogIds).toContain('yaca_watchlist_anime');

            // Hero compaiono nel manifest anche con Solo Anime (Ticket 15)
            expect(catalogIds).toContain('yaca_true_blend_movies');
            expect(catalogIds).toContain('yaca_true_blend_series');

            // Presets: anime presenti, non-anime assenti
            expect(catalogIds).toContain('preset_ghibli');
            expect(catalogIds).toContain('preset_pop_anime');
            expect(catalogIds).not.toContain('preset_pop_movies');
            expect(catalogIds).not.toContain('preset_pop_series');

            // Custom anime presente
            expect(catalogIds).toContain('custom_anime_matchmaker');
        });

        it('Profilo "No Anime": esclude anime presets e custom anime, include film e serie non-anime ed hero', () => {
            const configNoAnime = JSON.parse(JSON.stringify(baseUserConfig));
            configNoAnime.profiles[0].settings = {
                typeSelectors: { film: false, serie: false, anime: 'exclude' }
            };

            const manifest = buildManifest(configNoAnime);
            const catalogIds = manifest.catalogs.map(c => c.id);

            // Non-anime e hero inclusi
            expect(catalogIds).toContain('preset_pop_movies');
            expect(catalogIds).toContain('preset_pop_series');
            expect(catalogIds).toContain('yaca_true_blend_movies');
            expect(catalogIds).toContain('yaca_true_blend_series');

            // Anime esclusi
            expect(catalogIds).not.toContain('preset_ghibli');
            expect(catalogIds).not.toContain('preset_pop_anime');
            expect(catalogIds).not.toContain('custom_anime_matchmaker');

            // Watchlist sempre presente (inclusa la watchlist anime dell'utente)
            expect(catalogIds).toContain('yaca_watchlist_anime');
        });
    });

    describe('4. Guardia catalogHandler: richiesta diretta degradata a { metas: [] }', () => {
        const userConfigAnimeOnly = {
            userId: 'user_guard_test',
            activeProfileId: 'p_anime',
            apiKeys: { tmdb: 'fake_tmdb_key' },
            profiles: [
                {
                    id: 'p_anime',
                    name: 'Solo Anime Profile',
                    settings: {
                        typeSelectors: { film: false, serie: false, anime: 'only' }
                    },
                    catalogs: [
                        { id: 'preset_pop_movies', type: 'movie', name: 'Film Popolari' }
                    ]
                }
            ]
        };

        it('richiesta diretta di un catalogo preset non-anime su profilo "Solo Anime" restituisce { metas: [] } senza errori', async () => {
            const response = await catalogHandler(
                { id: 'preset_pop_movies', type: 'movie', extra: {} },
                userConfigAnimeOnly,
                'http://localhost:7000'
            );

            expect(response).toEqual({ metas: [] });
        });

        it('richiesta diretta di un hero su profilo "Solo Anime" NON viene bloccata dalla guardia (è conforme)', () => {
            const isConf = isCatalogConformant('yaca_true_blend_movies', userConfigAnimeOnly.profiles[0].settings.typeSelectors);
            expect(isConf).toBe(true);
        });

        it('richiesta diretta con residui legacy film/serie non viene bloccata dalla guardia', () => {
            const legacySelectors = { film: false, serie: true, anime: null };
            expect(isCatalogConformant('preset_pop_movies', legacySelectors)).toBe(true);
            expect(isCatalogConformant('yaca_true_blend_movies', legacySelectors)).toBe(true);
        });

    });
});
