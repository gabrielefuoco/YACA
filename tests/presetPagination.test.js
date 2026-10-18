jest.mock('../src/indice/duckDbProvider', () => {
    const actual = jest.requireActual('../src/indice/duckDbProvider');
    return {
        ...actual,
        getDuckDbCatalogFromFilters: jest.fn(),
        getDuckDbCatalogFromPreset: jest.fn(async () => [])
    };
});

jest.mock('../src/stremio/hybridServing', () => ({
    TASTE_BASED_IDS: new Set(),
    getEngineHybridCatalog: jest.fn()
}));

jest.mock('../src/stremio/providers/TraktProvider', () => ({
    getTraktCatalog: jest.fn()
}));

jest.mock('../src/stremio/providers/AiDiscoveryProvider', () => ({
    executeCombinedSearch: jest.fn(),
    executeUniversalPipeline: jest.fn()
}));

jest.mock('../src/stremio/providers/AiringStateProvider', () => ({
    getAiringStateCatalog: jest.fn()
}));

jest.mock('../src/stremio/providers/WatchlistProvider', () => ({
    getWatchlistCatalog: jest.fn()
}));

const { getDuckDbCatalogFromPreset } = require('../src/indice/duckDbProvider');
const { routeCatalogRequest, PRESET_PAGE_SIZE } = require('../src/stremio/CatalogRouter');
const { compileQuery } = require('../src/indice/compiler');

const EMPTY_USER_CONFIG = { profiles: [], activeProfileId: null };

describe('Ticket 20: paginazione deterministica dei preset DuckDB', () => {
    beforeEach(() => {
        getDuckDbCatalogFromPreset.mockClear();
        getDuckDbCatalogFromPreset.mockResolvedValue([]);
    });

    test('il router richiede esattamente 20 item per pagina ai preset nativi', async () => {
        const catalogMeta = {
            id: 'preset_pop_movies',
            type: 'movie',
            where: ['adult = false'],
            orderBy: '"popularity" DESC NULLS LAST'
        };

        await routeCatalogRequest(
            {
                id: 'yaca_preset_preset_pop_movies',
                type: 'movie',
                extra: { skip: 20 }
            },
            EMPTY_USER_CONFIG,
            {},
            'test-key',
            {},
            {},
            catalogMeta
        );

        expect(PRESET_PAGE_SIZE).toBe(20);
        expect(getDuckDbCatalogFromPreset).toHaveBeenCalledTimes(1);
        expect(getDuckDbCatalogFromPreset).toHaveBeenCalledWith(catalogMeta, 20, 20, { kidsMode: false });
    });

    test('il limite nativo dei custom catalog resta separato da quello dei preset', async () => {
        const catalogMeta = {
            id: 'custom_native',
            type: 'movie',
            where: [],
            orderBy: '"popularity" DESC NULLS LAST'
        };

        await routeCatalogRequest(
            { id: 'custom_native', type: 'movie', extra: { skip: 20 } },
            EMPTY_USER_CONFIG,
            {},
            'test-key',
            {},
            {},
            catalogMeta
        );

        expect(getDuckDbCatalogFromPreset).toHaveBeenCalledWith(catalogMeta, 20, 100, { kidsMode: false });
    });

    test('la query standard applica id ASC prima di LIMIT/OFFSET', async () => {
        const { sql, params } = await compileQuery({
            type: 'movie',
            where: ['"vote_count" >= 100'],
            orderBy: '"vote_average" DESC, "vote_count" DESC'
        }, 20, 20);

        expect(sql).toContain(
            'ORDER BY "vote_average" DESC, "vote_count" DESC, id ASC LIMIT ? OFFSET ?'
        );
        expect(params).toEqual(expect.arrayContaining([20, 20]));
    });

    test('la query FTS applica id ASC prima di LIMIT/OFFSET', async () => {
        const { sql, params } = await compileQuery({
            type: 'series',
            where: [{ _fts: 'matrix' }],
            orderBy: '"popularity" DESC NULLS LAST'
        }, 20, 20);

        expect(sql).toContain("ORDER BY CASE WHEN lower(trim(coalesce(name, '')))");
        expect(sql).toContain(
            "fts_main_tv.match_bm25(id, ?) DESC, id ASC LIMIT ? OFFSET ?"
        );
        expect(params).toEqual(expect.arrayContaining([20, 20]));
    });
});
