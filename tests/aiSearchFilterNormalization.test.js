const {
    clearAiFilterResolutionCache,
    normalizeAiDiscoveryQueries
} = require('../src/catalog/providers/AiQueryNormalizer');
const { buildPresetFromFilters } = require('../src/catalog/providers/DuckDbProvider');
const { F } = require('../src/data/filters');

function makeTmdbClient() {
    const keywordIds = {
        superhero: 501,
        marvel: 502,
        romance: 503,
        'not a real keyword': null
    };
    const personIds = {
        'Brad Pitt': 287,
        'Morgan Freeman': 128
    };

    return {
        get: jest.fn(async (endpoint, { params }) => {
            const lookup = endpoint === '/search/keyword' ? keywordIds : personIds;
            const name = params.query;
            const id = lookup[name];
            return {
                data: {
                    results: id ? [{ id, name }] : []
                }
            };
        })
    };
}

describe('Ticket 29 — normalizzazione filtri AI → DuckDB', () => {
    beforeEach(() => {
        clearAiFilterResolutionCache();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(() => {
        clearAiFilterResolutionCache();
    });

    test('mappa un blocco discovery completo e risolve keyword/persone tramite TMDB', async () => {
        const tmdbClient = makeTmdbClient();
        const input = {
            strategy: 'discovery',
            genre_ids: [16, 878],
            without_genre_ids: [27],
            keyword: 'superhero|marvel',
            without_keyword: 'romance',
            original_language: 'en',
            year_from: '2000',
            year_to: '2005',
            people_list: ['Brad Pitt', 'Morgan Freeman'],
            sort_by: 'revenue.desc',
            'vote_average.gte': 7.2,
            'vote_count.gte': 100
        };

        const [normalized] = await normalizeAiDiscoveryQueries([input], {
            type: 'movie',
            tmdbClient
        });

        expect(normalized).toEqual(expect.objectContaining({
            with_genres: '16|878',
            without_genres: '27',
            with_keywords: '501|502',
            without_keywords: '503',
            with_original_language: 'en',
            'primary_release_date.gte': '2000-01-01',
            'primary_release_date.lte': '2005-12-31',
            with_cast: '287|128',
            _keywordNames: 'superhero|marvel',
            strategy: 'discovery',
            sort_by: 'revenue.desc',
            'vote_average.gte': 7.2,
            'vote_count.gte': 100
        }));
        expect(tmdbClient.get).toHaveBeenCalledWith('/search/keyword', {
            params: { query: 'superhero' }
        });
        expect(tmdbClient.get).toHaveBeenCalledWith('/search/person', {
            params: { query: 'Brad Pitt' }
        });

        // La seconda normalizzazione usa la cache RAM: nessuna nuova chiamata TMDB.
        await normalizeAiDiscoveryQueries([input], { type: 'movie', tmdbClient });
        expect(tmdbClient.get).toHaveBeenCalledTimes(5);
    });

    test('per le serie usa first_air_date e mantiene i campi nativi già corretti', async () => {
        const tmdbClient = makeTmdbClient();
        const input = {
            strategy: 'discovery',
            genre_ids: [16, 18],
            original_language: 'ja',
            year_from: '2010',
            year_to: '2020',
            sort_by: 'primary_release_date.desc',
            text_search: 'kept unchanged',
            similar_to: 'kept too',
            static_items: ['kept', 'as well']
        };

        const [normalized] = await normalizeAiDiscoveryQueries([input], {
            type: 'series',
            tmdbClient
        });

        expect(normalized).toEqual(expect.objectContaining({
            with_genres: '16|18',
            with_original_language: 'ja',
            'first_air_date.gte': '2010-01-01',
            'first_air_date.lte': '2020-12-31',
            sort_by: 'primary_release_date.desc',
            text_search: 'kept unchanged',
            similar_to: 'kept too',
            static_items: ['kept', 'as well']
        }));
        expect(normalized['primary_release_date.gte']).toBeUndefined();
    });

    test('scarta un nome non risolto senza inventare ID e conserva quelli validi', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const tmdbClient = makeTmdbClient();

        const [normalized] = await normalizeAiDiscoveryQueries([{
            strategy: 'discovery',
            keyword: 'marvel|not a real keyword'
        }], { type: 'movie', tmdbClient });

        expect(normalized.with_keywords).toBe('502');
        expect(normalized.keyword).toBe('marvel|not a real keyword');
        expect(normalized._keywordNames).toBe('marvel|not a real keyword');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"not a real keyword" non risolto'));
        expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('with_keywords: "not a real keyword"'));

        warn.mockRestore();
    });

    test('esclude una query se tutte le risoluzioni falliscono, evitando il catalogo generico', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const tmdbClient = makeTmdbClient();

        const result = await normalizeAiDiscoveryQueries([{
            strategy: 'discovery',
            genre_ids: [53],
            people_list: ['Unknown Person 29']
        }], { type: 'movie', tmdbClient });

        expect(result).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Query discovery esclusa'));
        warn.mockRestore();
    });

    test('non sovrascrive un blocco che usa già i campi interni', async () => {
        const tmdbClient = makeTmdbClient();
        const input = {
            strategy: 'discovery',
            with_genres: '18|10749',
            with_keywords: '601|602',
            with_original_language: 'it',
            'primary_release_date.gte': '1990-01-01',
            'primary_release_date.lte': '1999-12-31',
            with_cast: '701|702',
            sort_by: 'vote_average.desc',
            'vote_average.gte': 8,
            'vote_count.gte': 200
        };

        const [normalized] = await normalizeAiDiscoveryQueries([input], {
            type: 'movie',
            tmdbClient
        });

        expect(normalized).toEqual(input);
        expect(tmdbClient.get).not.toHaveBeenCalled();
    });

    test('F.actor è variadico e DuckDbProvider splitta gli ID people_list su pipe', () => {
        const preset = buildPresetFromFilters({ with_cast: '287|128' }, 'movie');
        const actorClause = preset.where.find(clause => String(clause).includes('"cast"'));

        expect(actorClause).toBe(F.actor(287, 128));
        expect(actorClause).toContain('"id":287');
        expect(actorClause).toContain('"id":128');
        expect(actorClause).toContain(' OR ');
    });
});
