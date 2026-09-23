const { interleaveMultipleResults, applyConsensusScoring } = require('../src/utils/resultMerger');
const { getBaseId, normalizeContentId } = require('../src/utils/contentId');
const { getHybridPopularCatalog } = require('../src/catalog/providers/HybridProvider');

// Mock delle dipendenze di HybridProvider
jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return {
        ...actual,
        getDuckDbCatalogFromFilters: jest.fn()
    };
});
jest.mock('../src/clients/trakt', () => ({
    fetchTraktCatalog: jest.fn()
}));

const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
const { fetchTraktCatalog } = require('../src/clients/trakt');

describe('BUG-02: Dedup Namespace-Aware (kitsu vs tmdb collision fix)', () => {
    describe('contentId helper behavior contrast', () => {
        it('dimostra che normalizeContentId collassa kitsu:1100 e tmdb:1100 sullo stesso ID', () => {
            const kitsuNormalized = normalizeContentId('kitsu:1100');
            const tmdbNormalized = normalizeContentId('tmdb:1100');

            expect(kitsuNormalized).toBe('1100');
            expect(tmdbNormalized).toBe('1100');
            // Prima del fix, un Set basato su normalizeContentId collassava entrambi
            expect(kitsuNormalized).toBe(tmdbNormalized);
        });

        it('dimostra che getBaseId preserva il prefisso di namespace per kitsu: e tmdb:', () => {
            const kitsuBase = getBaseId('kitsu:1100');
            const tmdbBase = getBaseId('tmdb:1100');

            expect(kitsuBase).toBe('kitsu:1100');
            expect(tmdbBase).toBe('tmdb:1100');
            // Con getBaseId non c'è collisione tra namespace differenti
            expect(kitsuBase).not.toBe(tmdbBase);
        });
    });

    describe('interleaveMultipleResults (resultMerger)', () => {
        it('NON collassa kitsu:1100 e tmdb:1100 nello stesso set: entrambi devono essere presenti', () => {
            const kitsuItems = [{ id: 'kitsu:1100', name: 'Anime 1100' }];
            const tmdbItems = [{ id: 'tmdb:1100', name: 'Movie 1100' }];

            const result = interleaveMultipleResults([kitsuItems, tmdbItems], 10, 0);

            expect(result).toHaveLength(2);
            expect(result.map(i => i.id)).toEqual(['kitsu:1100', 'tmdb:1100']);
        });

        it('deduplica correttamente item con lo stesso namespace e id', () => {
            const list1 = [{ id: 'kitsu:1100', name: 'Anime 1100 copy 1' }];
            const list2 = [{ id: 'kitsu:1100', name: 'Anime 1100 copy 2' }];

            const result = interleaveMultipleResults([list1, list2], 10, 0);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('kitsu:1100');
            expect(result[0].name).toBe('Anime 1100 copy 1');
        });

        it('deduplica correttamente item numerici o generici', () => {
            const list1 = [{ id: 123 }, { id: 'tt999' }];
            const list2 = [{ id: 123 }, { id: 'tt999' }, { id: 456 }];

            const result = interleaveMultipleResults([list1, list2], 10, 0);

            expect(result.map(i => i.id)).toEqual([123, 123, 'tt999', 456].filter((v, idx, a) => a.indexOf(v) === idx));
        });
    });

    describe('applyConsensusScoring (resultMerger)', () => {
        it('NON unisce kitsu:1100 e tmdb:1100 nello stesso consensus bucket', () => {
            const query1 = [{ id: 'kitsu:1100', title: 'Anime 1100' }];
            const query2 = [{ id: 'tmdb:1100', title: 'Film 1100' }];

            const result = applyConsensusScoring([query1, query2]);

            // Se collassassero, ci sarebbe solo 1 item con consensusCount = 2
            expect(result).toHaveLength(2);
            const kitsuItem = result.find(i => i.id === 'kitsu:1100');
            const tmdbItem = result.find(i => i.id === 'tmdb:1100');

            expect(kitsuItem).toBeDefined();
            expect(kitsuItem.consensusCount).toBe(1);
            expect(kitsuItem.consensusBonus).toBe(0);

            expect(tmdbItem).toBeDefined();
            expect(tmdbItem.consensusCount).toBe(1);
            expect(tmdbItem.consensusBonus).toBe(0);
        });

        it('assegna correttamente consensus bonus quando lo stesso ID namespace-aware appare in più query', () => {
            const query1 = [{ id: 'kitsu:1100', title: 'Anime 1100' }];
            const query2 = [{ id: 'kitsu:1100', title: 'Anime 1100' }];

            const result = applyConsensusScoring([query1, query2]);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('kitsu:1100');
            expect(result[0].consensusCount).toBe(2);
            expect(result[0].consensusBonus).toBe(3); // 2^2 - 1 = 3
        });
    });

    describe('getHybridPopularCatalog (HybridProvider)', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('preserva sia kitsu:1100 che tmdb:1100 senza scartare per collisione di ID', async () => {
            getDuckDbCatalogFromFilters.mockResolvedValueOnce([
                { id: 'tmdb:1100', title: 'TMDB Item 1100' }
            ]);
            fetchTraktCatalog.mockResolvedValueOnce([
                { id: 'kitsu:1100', title: 'Kitsu Item 1100' }
            ]);

            const userConfig = { userId: 'u1' };
            const results = await getHybridPopularCatalog('hybrid_pop', 'movie', 0, userConfig, {}, 'fake-key', {});

            expect(results).toHaveLength(2);
            expect(results.map(r => r.id)).toEqual(['tmdb:1100', 'kitsu:1100']);
        });

        it('esegue esattamente 1 fetch per richiesta (nessun prefetch multi-pagina né refill)', async () => {
            getDuckDbCatalogFromFilters.mockResolvedValueOnce([
                { id: 'tmdb:1', title: 'Item 1' }
            ]);
            fetchTraktCatalog.mockResolvedValueOnce([
                { id: 'tmdb:2', title: 'Item 2' }
            ]);

            const userConfig = { userId: 'u1', config: { hideWatched: true } };
            await getHybridPopularCatalog('hybrid_pop', 'movie', 40, userConfig, {}, 'fake-key', {});

            // Una sola chiamata a DuckDb e una sola a Trakt con skip = 40
            expect(getDuckDbCatalogFromFilters).toHaveBeenCalledTimes(1);
            expect(getDuckDbCatalogFromFilters).toHaveBeenCalledWith(
                { sort_by: 'popularity.desc', 'vote_count.gte': 50 },
                'movie',
                40,
                20,
                {}
            );
            expect(fetchTraktCatalog).toHaveBeenCalledTimes(1);
            expect(fetchTraktCatalog).toHaveBeenCalledWith(
                'popular_movies',
                40,
                null,
                'fake-key'
            );
        });
    });
});
