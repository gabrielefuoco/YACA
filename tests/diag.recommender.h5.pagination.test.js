/**
 * H5 — Paginazione rotta per cataloghi multi-query (duplicati/salti tra pagine).
 *
 * Evidenza: nel ramo interleave AiDiscoveryProvider.js:191 chiama
 * interleaveMultipleResults(queryResults, PAGE_SIZE) SENZA passare skip → lo slice globale
 * parte sempre da 0 (resultMerger.js:28). Nel ramo non-interleave (consensus):
 * perQuerySkip = skip (:167-171) ma poi finalItems.slice(0, PAGE_SIZE) (:204) sul merge
 * delle CODE (skip..skip+20 di ogni query), non sul seguito della pagina precedente:
 * gli item condivisi tra finestre diverse delle query riappaiono in pagina 2.
 *
 * Test (ROSSO-capaci): 2-3 query paginate in modo deterministico, skip=0 vs skip=20
 * devono produrre insiemi di ID disgiunti. Oggi i due rami restituiscono duplicati.
 */

const { executeUniversalPipeline } = require('../src/catalog/providers/AiDiscoveryProvider');

jest.mock('../src/clients/tmdb', () => ({
    createTmdbClient: jest.fn(() => ({ get: jest.fn() })),
    getTmdbIdByName: jest.fn()
}));

jest.mock('../src/ai/router', () => ({
    routeLiveStremioSearch: jest.fn()
}));

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/engines/hybridRecommendations', () => ({
    computeTopGenres: jest.fn(() => []),
    computeTopKeywords: jest.fn(() => [])
}));

jest.mock('../src/catalog/processors/MetadataHydrator', () => ({
    hydrateResultsFromLocalDetailsCache: jest.fn(async () => {})
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbCatalogFromFilters: jest.fn()
}));

const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');

// Paginazione deterministica: keyword 'a' → a_0..a_N, keyword 'b' → b_0..b_N,
// keyword 'c' → c_0..c_N. Per il test consensus 'b' è slittata di 25 rispetto ad 'a'
// (stessi ID → consensusBonus, come query reali che si sovrappongono).
function pagedResults(filters, type, skip, limit) {
    const keyword = filters.keyword;
    const out = [];
    for (let i = 0; i < limit; i++) {
        let n;
        if (keyword === 'a') n = skip + i;
        else if (keyword === 'b') n = skip + i + 25;
        else n = skip + i;
        const prefix = keyword === 'c' ? 'c' : 'a';
        out.push({ id: `tmdb:${prefix}_${n}`, popularity: 1000 - n });
    }
    return Promise.resolve(out);
}

function idsOf(items) {
    return items.map(i => String(i.id).split(':').pop()).sort();
}

describe('H5 — paginazione multi-query', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        DuckDbProvider.getDuckDbCatalogFromFilters.mockImplementation(pagedResults);
    });

    it('ROSSO: consensus (2 query sovrapposte) — pagina 1 e pagina 2 devono essere disgiunte', async () => {
        const catalog = {
            queries: [
                { strategy: 'discovery', keyword: 'a' },
                { strategy: 'discovery', keyword: 'b' }
            ],
            presentation_strategy: 'popularity'
        };

        const page1 = await executeUniversalPipeline(catalog, {}, 'tmdb-key', 'movie', 0, {}, {});
        const page2 = await executeUniversalPipeline(catalog, {}, 'tmdb-key', 'movie', 20, {}, {});

        const ids1 = new Set(idsOf(page1));
        const ids2 = idsOf(page2);
        const dups = ids2.filter(id => ids1.has(id));
        expect(dups).toEqual([]);
    });

    it('ROSSO: interleave (3 query) — pagina 1 e pagina 2 devono essere disgiunte', async () => {
        const catalog = {
            queries: [
                { strategy: 'discovery', keyword: 'a' },
                { strategy: 'discovery', keyword: 'b' },
                { strategy: 'discovery', keyword: 'c' }
            ],
            presentation_strategy: 'interleave'
        };

        const page1 = await executeUniversalPipeline(catalog, {}, 'tmdb-key', 'movie', 0, {}, {});
        const page2 = await executeUniversalPipeline(catalog, {}, 'tmdb-key', 'movie', 20, {}, {});

        const ids1 = new Set(idsOf(page1));
        const ids2 = idsOf(page2);
        const dups = ids2.filter(id => ids1.has(id));
        expect(dups).toEqual([]);
    });

    it('esegue tutte le fonti manual_list e pagina le successive 20 senza troncamento', async () => {
        const queries = Array.from({ length: 25 }, (_, index) => ({
            strategy: 'manual_list',
            with_id: index + 1
        }));
        const catalog = { queries, presentation_strategy: 'popularity' };

        const itemsLength = 25;
        DuckDbProvider.getDuckDbCatalogFromFilters.mockImplementation((filters, type, skip, limit) => {
            const items = filters.tmdbIds.map((id, index) => ({
                id: `tmdb:${id}`,
                popularity: itemsLength - index
            }));
            return Promise.resolve(items.slice(skip, skip + limit));
        });

        const page1 = await executeUniversalPipeline(catalog, {}, 'tmdb-key', 'movie', 0, {}, {});
        expect(page1).toHaveLength(20);
        expect(DuckDbProvider.getDuckDbCatalogFromFilters).toHaveBeenCalledTimes(1);
        expect(DuckDbProvider.getDuckDbCatalogFromFilters.mock.calls[0][0].tmdbIds).toHaveLength(25);
        expect(DuckDbProvider.getDuckDbCatalogFromFilters.mock.calls[0][2]).toBe(0);

        DuckDbProvider.getDuckDbCatalogFromFilters.mockClear();
        const page2 = await executeUniversalPipeline(catalog, {}, 'tmdb-key', 'movie', 20, {}, {});
        expect(page2).toHaveLength(5);
        expect(DuckDbProvider.getDuckDbCatalogFromFilters).toHaveBeenCalledTimes(1);
        expect(DuckDbProvider.getDuckDbCatalogFromFilters.mock.calls[0][2]).toBe(20);
        expect(idsOf(page2).some(id => idsOf(page1).includes(id))).toBe(false);
    });

    it('verde (documentazione): ramo a query singola pagina correttamente', async () => {
        const catalog = {
            queries: [{ strategy: 'discovery', keyword: 'a' }],
            presentation_strategy: 'popularity'
        };

        const page1 = await executeUniversalPipeline(catalog, {}, 'tmdb-key', 'movie', 0, {}, {});
        const page2 = await executeUniversalPipeline(catalog, {}, 'tmdb-key', 'movie', 20, {}, {});

        const ids1 = new Set(idsOf(page1));
        const ids2 = idsOf(page2);
        const dups = ids2.filter(id => ids1.has(id));
        expect(dups).toEqual([]);
    });
});
