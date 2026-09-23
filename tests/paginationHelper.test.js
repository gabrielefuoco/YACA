const { executePaginatedFetch } = require('../src/catalog/providers/paginationHelper');

describe('paginationHelper (1 fetch per richiesta)', () => {
    it('esegue esattamente 1 singola invocazione di fetchFn con lo skip indicato', async () => {
        const fetchFn = jest.fn().mockResolvedValue([
            { id: 'tmdb:1' },
            { id: 'tmdb:2' },
            { id: 'tmdb:3' }
        ]);

        const userConfig = { userId: 'u1', config: { hideWatched: true } };
        const results = await executePaginatedFetch(fetchFn, 20, 20, userConfig);

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(fetchFn).toHaveBeenCalledWith(20);
        expect(results).toHaveLength(3);
    });

    it('rispetta il parametro limit se i risultati eccedono la soglia', async () => {
        const fetchFn = jest.fn().mockResolvedValue([
            { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }
        ]);

        const results = await executePaginatedFetch(fetchFn, 0, 3, {});
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(results).toHaveLength(3);
        expect(results.map(r => r.id)).toEqual([1, 2, 3]);
    });

    it('ritorna array vuoto se fetchFn non restituisce un array', async () => {
        const fetchFn = jest.fn().mockResolvedValue(null);
        const results = await executePaginatedFetch(fetchFn, 0, 20, {});
        expect(results).toEqual([]);
    });
});
