jest.mock('../src/db/models/UserLibraryItem', () => ({
    find: jest.fn()
}));

jest.mock('../src/services/LibrarySyncService', () => ({
    syncLibraryForUser: jest.fn()
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return {
        ...actual,
        getDuckDbCatalogFromFilters: jest.fn(),
        getDuckDbCatalogFromPreset: jest.fn()
    };
});

jest.mock('../src/catalog/providers/HybridProvider', () => ({
    TASTE_BASED_IDS: new Set(),
    getEngineHybridCatalog: jest.fn()
}));

jest.mock('../src/catalog/providers/TraktProvider', () => ({
    getTraktCatalog: jest.fn()
}));

jest.mock('../src/catalog/providers/AiDiscoveryProvider', () => ({
    executeCombinedSearch: jest.fn(),
    executeUniversalPipeline: jest.fn()
}));

jest.mock('../src/catalog/providers/AiringStateProvider', () => ({
    getAiringStateCatalog: jest.fn()
}));

const UserLibraryItem = require('../src/db/models/UserLibraryItem');
const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
const {
    getWatchlistCatalog,
    WATCHLIST_PAGE_SIZE
} = require('../src/catalog/providers/WatchlistProvider');
const { routeCatalogRequest } = require('../src/catalog/CatalogRouter');
const { buildCatalogQuery } = require('../src/db/queryBuilder');

describe('U-03: paginazione utility a 20 item', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getDuckDbCatalogFromFilters.mockResolvedValue([]);
    });

    test('la watchlist usa 20 item, offset reale e ordinamento stabile', async () => {
        const lean = jest.fn().mockResolvedValue([]);
        const limit = jest.fn().mockReturnValue({ lean });
        const skip = jest.fn().mockReturnValue({ limit });
        const sort = jest.fn().mockReturnValue({ skip });
        UserLibraryItem.find.mockReturnValue({ sort });

        await getWatchlistCatalog(
            'yaca_watchlist_movies',
            'movie',
            20,
            { addonUuid: 'sim-uuid' },
            {}
        );

        expect(WATCHLIST_PAGE_SIZE).toBe(20);
        expect(sort).toHaveBeenCalledWith({ _mtime: -1, itemId: 1 });
        expect(skip).toHaveBeenCalledWith(20);
        expect(limit).toHaveBeenCalledWith(20);
    });

    test('la ricerca standard usa 20 item e propaga lo skip reale', async () => {
        const activeProfileSettings = { kidsMode: true };

        await routeCatalogRequest(
            {
                id: 'yaca_search_standard',
                type: 'series',
                extra: { search: 'Spider-Man', skip: 20 }
            },
            { profiles: [], activeProfileId: null },
            {},
            'test-key',
            activeProfileSettings,
            {},
            null
        );

        expect(getDuckDbCatalogFromFilters).toHaveBeenCalledWith(
            { _search: 'Spider-Man' },
            'series',
            20,
            20,
            activeProfileSettings
        );
    });

    test('l ordinamento FTS standard mantiene il tie-breaker id prima di LIMIT/OFFSET', async () => {
        const sql = await buildCatalogQuery({
            type: 'movie',
            where: [{ _fts: 'Spider-Man' }],
            orderBy: '"popularity" DESC NULLS LAST'
        }, 20, 20);

        // Il ranking FTS è cambiato nel lotto E (boost del titolo esatto prima del BM25),
        // ma il contratto di paginazione resta: tie-breaker `id ASC` e offset reale.
        expect(sql).toMatch(/ORDER BY .*fts_main_movies\.match_bm25\(id, 'Spider-Man'\) DESC, id ASC LIMIT 20 OFFSET 20$/);
    });
});
