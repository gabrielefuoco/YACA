/**
 * tests/ticket55MondiCacheInvalidation.test.js
 *
 * Ticket 55: Verifica che la riga Hero "Il tuo mondo" (e tutti i cataloghi hero)
 * invalidi correttamente la cache pubblica (catalog_page) quando cambiano artefatto/ricetta
 * del grafo, e che un risultato con > 40 titoli da "il_tuo_mondo" venga servito correttamente
 * attraverso il percorso dell'app senza rimanere intrappolato in vecchie cache da 11 titoli.
 */

const { buildCatalogCacheKey, buildCatalogDesc } = require('../src/catalog/catalogDefinition');
const { catalogHandler } = require('../src/stremio/catalogHandler');
const { graphClient } = require('../src/clients');
const cache = require('../src/cache');
const { ITEMS_PER_PAGE } = require('../src/config');

jest.mock('../src/clients/graphClient', () => {
    const actual = jest.requireActual('../src/clients/graphClient');
    return {
        ...actual,
        getGraphHealthVersions: jest.fn(),
        getGraphHealthVersionsCached: jest.fn(),
        raccomanda: jest.fn()
    };
});

// Mock minimal dependencies for routeCatalogRequest in catalogHandler
jest.mock('../src/stremio/CatalogRouter', () => ({
    routeCatalogRequest: jest.fn()
}));

const { routeCatalogRequest } = require('../src/stremio/CatalogRouter');

describe('Ticket 55: Invalidazione cache per righe Hero e serving completo di «Il tuo mondo»', () => {
    const userConfig = {
        userId: 'REOZrGNRr3',
        activeProfileId: '4159713d',
        apiKeys: { tmdb: 'mock_tmdb_key' },
        profiles: [
            {
                id: '4159713d',
                name: 'Profile QA',
                settings: {
                    kidsMode: false,
                    typeSelectors: { film: true, serie: true, anime: 'neutral' }
                }
            }
        ]
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('1. La chiave di cache catalog_page per yaca_mondi_series cambia quando cambia la ricetta del grafo', () => {
        const keyOld = buildCatalogCacheKey({
            id: 'yaca_mondi_series',
            baseId: 'yaca_mondi_series',
            type: 'series',
            skip: 0,
            userConfig,
            activeProfileSettings: userConfig.profiles[0].settings,
            graphVersions: { artefatto: 'cf1d80dcba3eddce', ricetta: '8b2d7932_old' }
        });

        const keyNew = buildCatalogCacheKey({
            id: 'yaca_mondi_series',
            baseId: 'yaca_mondi_series',
            type: 'series',
            skip: 0,
            userConfig,
            activeProfileSettings: userConfig.profiles[0].settings,
            graphVersions: { artefatto: 'cf1d80dcba3eddce', ricetta: '2330b143_new' }
        });

        expect(keyOld).not.toBe(keyNew);
    });

    test('2. Un catalogo non-hero (es. preset o watchlist) ignora graphVersions e mantiene la chiave stabile', () => {
        const keyPresetA = buildCatalogCacheKey({
            id: 'yaca_preset_preset_pop_series',
            baseId: 'preset_pop_series',
            type: 'series',
            skip: 0,
            userConfig,
            activeProfileSettings: userConfig.profiles[0].settings,
            graphVersions: { artefatto: 'artA', ricetta: 'ricA' }
        });

        const keyPresetB = buildCatalogCacheKey({
            id: 'yaca_preset_preset_pop_series',
            baseId: 'preset_pop_series',
            type: 'series',
            skip: 0,
            userConfig,
            activeProfileSettings: userConfig.profiles[0].settings,
            graphVersions: { artefatto: 'artB', ricetta: 'ricB' }
        });

        expect(keyPresetA).toBe(keyPresetB);
    });

    test('3. Con il_tuo_mondo > 40 titoli (51 titoli), il percorso dell app serve la prima pagina piena (20) e il totale supera 20', async () => {
        // Genera 51 titoli mockati
        const mock51Titles = Array.from({ length: 51 }, (_, i) => ({
            id: `tmdb:${3000 + i}`,
            name: `Title ${i + 1}`,
            type: 'series',
            media_type: 'tv'
        }));

        // Mock routeCatalogRequest to return the 51 items for skip=0, or sliced for skip
        routeCatalogRequest.mockImplementation(async (args) => {
            const skip = args.extra?.skip || 0;
            return mock51Titles.slice(skip, skip + ITEMS_PER_PAGE);
        });

        graphClient.getGraphHealthVersions.mockResolvedValue({
            artefatto: 'cf1d80dcba3eddce',
            ricetta: '2330b143_new'
        });

        // Pagina 1 (skip=0)
        const page1 = await catalogHandler(
            { id: 'yaca_mondi_series', type: 'series', extra: { skip: 0 } },
            userConfig,
            'http://localhost:7000'
        );

        expect(page1).toBeDefined();
        expect(page1.metas).toHaveLength(ITEMS_PER_PAGE); // 20
        expect(page1.metas[0].name).toBe('Title 1');
        expect(page1.metas[19].name).toBe('Title 20');

        // Pagina 2 (skip=20)
        const page2 = await catalogHandler(
            { id: 'yaca_mondi_series', type: 'series', extra: { skip: 20 } },
            userConfig,
            'http://localhost:7000'
        );

        expect(page2).toBeDefined();
        expect(page2.metas).toHaveLength(ITEMS_PER_PAGE); // 20
        expect(page2.metas[0].name).toBe('Title 21');

        // Pagina 3 (skip=40)
        const page3 = await catalogHandler(
            { id: 'yaca_mondi_series', type: 'series', extra: { skip: 40 } },
            userConfig,
            'http://localhost:7000'
        );

        expect(page3).toBeDefined();
        expect(page3.metas).toHaveLength(11); // 11
        expect(page3.metas[10].name).toBe('Title 51');

        // Totale servito attraverso l'app per i 51 titoli: 20 + 20 + 11 = 51 (> 20)
        const totalTitles = page1.metas.length + page2.metas.length + page3.metas.length;
        expect(totalTitles).toBe(51);
        expect(totalTitles).toBeGreaterThan(20);
    });

    test('4. Modifica della ricetta invalida la risposta in cache e impedisce il riuso della pagina vecchia da 11 titoli', async () => {
        // Step A: con ricetta vecchia, catalogHandler riceve 11 titoli e li memorizza in cache
        const old11Titles = Array.from({ length: 11 }, (_, i) => ({
            id: `tmdb:${1000 + i}`,
            name: `Old World Title ${i + 1}`,
            type: 'series',
            media_type: 'tv'
        }));

        routeCatalogRequest.mockImplementationOnce(async () => old11Titles);
        graphClient.getGraphHealthVersions.mockResolvedValue({
            artefatto: 'cf1d80dcba3eddce',
            ricetta: 'old_recipe_pre_t40'
        });

        const resOld = await catalogHandler(
            { id: 'yaca_mondi_series', type: 'series', extra: { skip: 0 } },
            userConfig,
            'http://localhost:7000'
        );
        expect(resOld.metas).toHaveLength(11);

        // Step B: la ricetta del grafo si aggiorna a 'new_recipe_t40' e produce 20 titoli
        const new20Titles = Array.from({ length: 20 }, (_, i) => ({
            id: `tmdb:${2000 + i}`,
            name: `New Accumulated Title ${i + 1}`,
            type: 'series',
            media_type: 'tv'
        }));

        routeCatalogRequest.mockImplementationOnce(async () => new20Titles);
        graphClient.getGraphHealthVersions.mockResolvedValue({
            artefatto: 'cf1d80dcba3eddce',
            ricetta: 'new_recipe_t40'
        });

        const resNew = await catalogHandler(
            { id: 'yaca_mondi_series', type: 'series', extra: { skip: 0 } },
            userConfig,
            'http://localhost:7000'
        );

        // La voce non viene servita dalla vecchia cache: la risposta porta i 20 titoli nuovi
        expect(resNew.metas).toHaveLength(20);
        expect(resNew.metas[0].name).toBe('New Accumulated Title 1');
    });
});
