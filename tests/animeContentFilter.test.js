const { isItemAnime, catalogHandler } = require('../src/handlers/catalogHandler');
const { routeCatalogRequest } = require('../src/catalog/CatalogRouter');
const { catalogRequestCache } = require('../src/cache/cacheInstances');

// Mock di routeCatalogRequest per controllare precisamente gli item restituiti dal routing
jest.mock('../src/catalog/CatalogRouter', () => ({
    routeCatalogRequest: jest.fn()
}));


jest.mock('../src/db/models/StreamBadge', () => ({
    find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
    })
}));

describe('TICKET 13: Filtro dei contenuti anime dentro i cataloghi', () => {

    beforeEach(async () => {
        jest.clearAllMocks();
        await catalogRequestCache.clear();
    });

    describe('1. Unità isItemAnime (riconoscimento marcatore e fail-open)', () => {
        it('riconosce _isAnime === true esplicito', () => {
            const item = { id: 'tmdb:1', name: 'Anime Esplicito', _isAnime: true };
            expect(isItemAnime(item)).toBe(true);
        });

        it('riconosce _isAnime === false esplicito', () => {
            const item = { id: 'tmdb:2', name: 'Serie Esplicita Non Anime', _isAnime: false };
            expect(isItemAnime(item)).toBe(false);
        });

        it('fail-open: item senza _isAnime e senza metadati (genre/lingua/keyword) restituisce false', () => {
            const item = { id: 'tmdb:3', name: 'Serie Senza Metadati' };
            expect(isItemAnime(item)).toBe(false);
        });

        it('ricalcola con isAnimeContent se porta genre e lingua (genere 16 + ja)', () => {
            const item = {
                id: 'tmdb:4',
                name: 'Anime Con Genere e Lingua',
                genre_ids: [16, 18],
                original_language: 'ja'
            };
            expect(isItemAnime(item)).toBe(true);
            expect(item._isAnime).toBe(true);
        });

        it('ricalcola con isAnimeContent se porta generi come oggetti TMDB (Animation + ja)', () => {
            const item = {
                id: 'tmdb:5',
                name: 'Anime Con Oggetti Genere',
                genres: [{ id: 16, name: 'Animation' }],
                original_language: 'ja'
            };
            expect(isItemAnime(item)).toBe(true);
        });

        it('esclude produzioni occidentali animate (genere 16 ma lingua en e niente keyword anime)', () => {
            const item = {
                id: 'tmdb:6',
                name: 'The Simpsons',
                genre_ids: [16, 35],
                original_language: 'en'
            };
            expect(isItemAnime(item)).toBe(false);
            expect(item._isAnime).toBe(false);
        });

        it('esclude produzioni con keyword anime-inspired (Avatar / Castlevania)', () => {
            const item = {
                id: 'tmdb:7',
                name: 'Avatar The Last Airbender',
                genre_ids: [16, 10759],
                original_language: 'en',
                keywords: [{ id: 123, name: 'anime-inspired' }]
            };
            expect(isItemAnime(item)).toBe(false);
        });

        it('identifica item con type: anime o id kitsu/anilist', () => {
            expect(isItemAnime({ id: 'kitsu:1234', name: 'Kitsu Anime' })).toBe(true);
            expect(isItemAnime({ id: 'anilist:5678', name: 'AniList Anime' })).toBe(true);
            expect(isItemAnime({ id: 'custom:1', type: 'anime', name: 'Type Anime' })).toBe(true);
        });
    });

    describe('2. Filtro per item in catalogHandler per cataloghi di suggerimento (preset e hero)', () => {
        const createMockItems = () => [
            { id: 'tmdb:101', type: 'series', name: 'Attack on Titan', _isAnime: true },
            { id: 'tmdb:102', type: 'series', name: 'Breaking Bad', _isAnime: false },
            { id: 'tmdb:103', type: 'series', name: 'Serie Indipendente Senza Metadati' },
            { id: 'tmdb:104', type: 'series', name: 'Frieren (Inferito da meta)', genre_ids: [16], original_language: 'ja' },
            { id: 'tmdb:105', type: 'series', name: 'Succession (Inferito non anime)', genre_ids: [18], original_language: 'en' }
        ];

        const baseUserConfig = {
            userId: 'user_filter_test',
            activeProfileId: 'p_test',
            apiKeys: { tmdb: 'fake_tmdb_key' },
            profiles: [
                {
                    id: 'p_test',
                    name: 'Test Profile',
                    settings: {
                        typeSelectors: { film: false, serie: false, anime: null }
                    }
                }
            ]
        };

        it('anime === "exclude" (No Anime): rimuove gli item anime, mantiene i non-anime e l\'item senza metadati (fail-open)', async () => {
            routeCatalogRequest.mockResolvedValueOnce(createMockItems());

            const config = JSON.parse(JSON.stringify(baseUserConfig));
            config.profiles[0].settings.typeSelectors.anime = 'exclude';

            const response = await catalogHandler(
                { id: 'preset_pop_series', type: 'series', extra: {} },
                config,
                'http://localhost:7000'
            );

            expect(response).toHaveProperty('metas');
            const names = response.metas.map(m => m.name);

            // Anime esclusi
            expect(names).not.toContain('Attack on Titan');
            expect(names).not.toContain('Frieren (Inferito da meta)');

            // Non-anime inclusi
            expect(names).toContain('Breaking Bad');
            expect(names).toContain('Succession (Inferito non anime)');

            // Item senza _isAnime e senza metadati: PASSA per fail-open
            expect(names).toContain('Serie Indipendente Senza Metadati');
            expect(names.length).toBe(3);
        });

        it('anime === "only" (Solo Anime): tiene solo gli item anime (espliciti o inferiti)', async () => {
            routeCatalogRequest.mockResolvedValueOnce(createMockItems());

            const config = JSON.parse(JSON.stringify(baseUserConfig));
            config.profiles[0].settings.typeSelectors.anime = 'only';

            // Usiamo preset_pop_anime (conforme ai selettori Solo Anime)
            const response = await catalogHandler(
                { id: 'preset_pop_anime', type: 'series', extra: {} },
                config,
                'http://localhost:7000'
            );

            expect(response).toHaveProperty('metas');
            const names = response.metas.map(m => m.name);

            // Solo anime presenti
            expect(names).toContain('Attack on Titan');
            expect(names).toContain('Frieren (Inferito da meta)');

            // Non-anime esclusi
            expect(names).not.toContain('Breaking Bad');
            expect(names).not.toContain('Succession (Inferito non anime)');
            expect(names).not.toContain('Serie Indipendente Senza Metadati');
            expect(names.length).toBe(2);
        });

        it('anime assente o null: nessun filtro applicato, tutti gli item passano', async () => {
            routeCatalogRequest.mockResolvedValueOnce(createMockItems());

            const config = JSON.parse(JSON.stringify(baseUserConfig));
            config.profiles[0].settings.typeSelectors.anime = null;

            const response = await catalogHandler(
                { id: 'preset_pop_series', type: 'series', extra: {} },
                config,
                'http://localhost:7000'
            );

            expect(response).toHaveProperty('metas');
            expect(response.metas.length).toBe(5);
        });

        it('filtra correttamente anche sugli 8 Hero Catalogs (es. yaca_true_blend_series)', async () => {
            routeCatalogRequest.mockResolvedValueOnce([
                { id: 'tmdb:201', type: 'series', name: 'Hero Anime', _isAnime: true },
                { id: 'tmdb:202', type: 'series', name: 'Hero Drama', _isAnime: false }
            ]);

            const config = JSON.parse(JSON.stringify(baseUserConfig));
            config.profiles[0].settings.typeSelectors.anime = 'exclude';

            const response = await catalogHandler(
                { id: 'yaca_true_blend_series', type: 'series', extra: {} },
                config,
                'http://localhost:7000'
            );

            expect(response).toHaveProperty('metas');
            const names = response.metas.map(m => m.name);
            expect(names).not.toContain('Hero Anime');
            expect(names).toContain('Hero Drama');
            expect(names.length).toBe(1);
        });
    });

    describe('3. Perimetro: Utility, Ricerche e Watchlist NON vengono filtrate', () => {
        const baseUserConfig = {
            userId: 'user_perim_test',
            activeProfileId: 'p_test',
            apiKeys: { tmdb: 'fake_tmdb_key' },
            profiles: [
                {
                    id: 'p_test',
                    name: 'Test Profile',
                    settings: {
                        typeSelectors: { film: false, serie: false, anime: 'exclude' }
                    }
                }
            ]
        };

        it('yaca-profiles non viene filtrato', async () => {
            routeCatalogRequest.mockResolvedValueOnce([
                { id: 'yaca-profile-p_test', type: 'other', name: 'Test Profile', isSpecialProfile: true }
            ]);

            const config = JSON.parse(JSON.stringify(baseUserConfig));
            config.profiles[0].settings.typeSelectors.anime = 'exclude';

            const response = await catalogHandler(
                { id: 'yaca-profiles', type: 'other', extra: {} },
                config,
                'http://localhost:7000'
            );

            expect(response).toHaveProperty('metas');
            expect(response.metas.length).toBe(1);
            expect(response.metas[0].id).toBe('yaca-profile-p_test');
        });

        it('yaca_watchlist_anime non viene filtrata anche se il profilo è No Anime (libreria personale)', async () => {
            routeCatalogRequest.mockResolvedValueOnce([
                { id: 'tmdb:301', type: 'series', name: 'Watchlist Anime Title', _isAnime: true }
            ]);

            const config = JSON.parse(JSON.stringify(baseUserConfig));
            config.profiles[0].settings.typeSelectors.anime = 'exclude';

            const response = await catalogHandler(
                { id: 'yaca_watchlist_anime', type: 'series', extra: {} },
                config,
                'http://localhost:7000'
            );

            expect(response).toHaveProperty('metas');
            expect(response.metas.length).toBe(1);
            expect(response.metas[0].name).toBe('Watchlist Anime Title');
        });

        it('le ricerche (extra.search / yaca_search_standard) non vengono filtrate', async () => {
            routeCatalogRequest.mockResolvedValueOnce([
                { id: 'tmdb:401', type: 'series', name: 'Search Result Anime', _isAnime: true },
                { id: 'tmdb:402', type: 'series', name: 'Search Result Normal', _isAnime: false }
            ]);

            const config = JSON.parse(JSON.stringify(baseUserConfig));
            config.profiles[0].settings.typeSelectors.anime = 'exclude';

            const response = await catalogHandler(
                { id: 'yaca_search_standard', type: 'series', extra: { search: 'Naruto' } },
                config,
                'http://localhost:7000'
            );

            expect(response).toHaveProperty('metas');
            const names = response.metas.map(m => m.name);
            expect(names).toContain('Search Result Anime');
            expect(names).toContain('Search Result Normal');
            expect(names.length).toBe(2);
        });
    });

    describe('4. Regola sui selettori media (Solo Film / Solo Serie non filtrano gli item)', () => {
        it('i selettori film/serie non filtrano gli item se anime è null', async () => {
            routeCatalogRequest.mockResolvedValueOnce([
                { id: 'tmdb:501', type: 'series', name: 'Serie Con Genere Animazione', genre_ids: [16], original_language: 'ja', _isAnime: true },
                { id: 'tmdb:502', type: 'series', name: 'Serie Live Action', _isAnime: false }
            ]);

            const config = {
                userId: 'user_media_test',
                activeProfileId: 'p_test',
                apiKeys: { tmdb: 'fake_tmdb_key' },
                profiles: [
                    {
                        id: 'p_test',
                        name: 'Solo Serie Profile',
                        settings: {
                            typeSelectors: { film: false, serie: true, anime: null }
                        }
                    }
                ]
            };

            const response = await catalogHandler(
                { id: 'preset_pop_series', type: 'series', extra: {} },
                config,
                'http://localhost:7000'
            );

            expect(response).toHaveProperty('metas');
            // Entrambi gli item rimangono perché Solo Serie non filtra i contenuti anime
            expect(response.metas.length).toBe(2);
        });
    });

    describe('5. Niente refill: la lista accorciata viene restituita senza ulteriori fetch', () => {
        it('restituisce la lista ridotta senza invocare altre volte routeCatalogRequest', async () => {
            routeCatalogRequest.mockResolvedValueOnce([
                { id: 'tmdb:601', type: 'series', name: 'Anime 1', _isAnime: true },
                { id: 'tmdb:602', type: 'series', name: 'Anime 2', _isAnime: true },
                { id: 'tmdb:603', type: 'series', name: 'Serie 1', _isAnime: false }
            ]);

            const config = {
                userId: 'user_refill_test',
                activeProfileId: 'p_test',
                apiKeys: { tmdb: 'fake_tmdb_key' },
                profiles: [
                    {
                        id: 'p_test',
                        name: 'No Anime Profile',
                        settings: {
                            typeSelectors: { film: false, serie: false, anime: 'exclude' }
                        }
                    }
                ]
            };

            const response = await catalogHandler(
                { id: 'preset_pop_series', type: 'series', extra: {} },
                config,
                'http://localhost:7000'
            );

            expect(response.metas.length).toBe(1);
            expect(response.metas[0].name).toBe('Serie 1');
            expect(routeCatalogRequest).toHaveBeenCalledTimes(1);
        });
    });

    describe('6. Acceptance Criteria Brief: matrice completa su catalogo generale', () => {
        const generalCatalogItems = () => [
            { id: 'tmdb:901', type: 'series', name: 'Demon Slayer', _isAnime: true },
            { id: 'tmdb:902', type: 'series', name: 'The Wire', _isAnime: false },
            { id: 'tmdb:903', type: 'series', name: 'Serie Misteriosa Senza _isAnime' }
        ];

        const makeConfig = (animeSelector) => ({
            userId: 'user_matrix_test',
            activeProfileId: 'p_matrix',
            apiKeys: { tmdb: 'fake_tmdb_key' },
            profiles: [
                {
                    id: 'p_matrix',
                    name: 'Matrix Profile',
                    settings: {
                        typeSelectors: { film: false, serie: false, anime: animeSelector }
                    },
                    catalogs: [
                        // Catalogo misto ammissibile sia per No Anime che per Solo Anime nei test
                        { id: 'custom_general_catalog', type: 'series', isAnime: animeSelector === 'only' }
                    ]
                }
            ]
        });

        it('con No Anime: item con _isAnime NON compare; item senza _isAnime PASSA', async () => {
            routeCatalogRequest.mockResolvedValueOnce(generalCatalogItems());

            const response = await catalogHandler(
                { id: 'preset_pop_series', type: 'series', extra: {} },
                makeConfig('exclude'),
                'http://localhost:7000'
            );

            const names = response.metas.map(m => m.name);
            expect(names).not.toContain('Demon Slayer');
            expect(names).toContain('The Wire');
            expect(names).toContain('Serie Misteriosa Senza _isAnime');
            expect(names.length).toBe(2);
        });

        it('con Solo Anime: resta SOLO l\'item con _isAnime === true', async () => {
            routeCatalogRequest.mockResolvedValueOnce(generalCatalogItems());

            const response = await catalogHandler(
                { id: 'custom_general_catalog', type: 'series', extra: {} },
                makeConfig('only'),
                'http://localhost:7000'
            );

            const names = response.metas.map(m => m.name);
            expect(names).toEqual(['Demon Slayer']);
        });

        it('con anime: null: nessun filtro, passano tutti gli item', async () => {
            routeCatalogRequest.mockResolvedValueOnce(generalCatalogItems());

            const response = await catalogHandler(
                { id: 'preset_pop_series', type: 'series', extra: {} },
                makeConfig(null),
                'http://localhost:7000'
            );

            const names = response.metas.map(m => m.name);
            expect(names).toEqual(['Demon Slayer', 'The Wire', 'Serie Misteriosa Senza _isAnime']);
        });
    });
});

