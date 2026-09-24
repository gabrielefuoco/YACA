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

jest.mock('../src/catalog/processors/MetadataHydrator', () => ({
    hydrateResultsFromLocalDetailsCache: jest.fn(async () => {})
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbCatalogFromFilters: jest.fn()
}));

jest.mock('../src/engines/hybridRecommendations', () => ({
    computeTopGenres: jest.fn(() => ['878']),
    computeTopKeywords: jest.fn(() => ['878'])
}));

const { executeCombinedSearch } = require('../src/catalog/providers/AiDiscoveryProvider');
const router = require('../src/ai/router');
const TasteProfile = require('../src/models/TasteProfile');
const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');

const USER_CONFIG = {
    userId: 'user-1',
    activeProfileId: 'cinephile',
    apiKeys: { tmdb: 'tmdb-key', mistral: '' }
};

describe('Ricerca AI — fallback lessicale onesto', () => {
    const originalMistralKey = process.env.MISTRAL_API_KEY;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.MISTRAL_API_KEY = '';
        TasteProfile.findOne.mockResolvedValue({ owner: 'user-1', context: 'cinephile' });
    });

    afterAll(() => {
        if (originalMistralKey === undefined) {
            delete process.env.MISTRAL_API_KEY;
        } else {
            process.env.MISTRAL_API_KEY = originalMistralKey;
        }
    });

    test('senza Mistral usa solo il titolo, preserva la rilevanza e non applica il profilo', async () => {
        DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValue([
            { id: 'tmdb:78', name: 'Blade Runner', rawTMDB: { vote_average: 8.1 } },
            { id: 'tmdb:335984', name: 'Blade Runner 2049', rawTMDB: { vote_average: 8.0 } }
        ]);

        const results = await executeCombinedSearch(
            'Blade Runner',
            USER_CONFIG,
            'movie',
            20,
            { kidsMode: false },
            {}
        );

        expect(router.routeLiveStremioSearch).not.toHaveBeenCalled();
        expect(DuckDbProvider.getDuckDbCatalogFromFilters).toHaveBeenCalledTimes(1);
        expect(DuckDbProvider.getDuckDbCatalogFromFilters).toHaveBeenCalledWith(
            { text_search: 'Blade Runner' },
            'movie',
            20,
            20,
            { kidsMode: false }
        );
        expect(results.map(item => item.id)).toEqual(['tmdb:78', 'tmdb:335984']);
    });

    test('una query descrittiva senza corrispondenza lessicale resta vuota', async () => {
        DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValue([]);

        const results = await executeCombinedSearch(
            'superhero films',
            USER_CONFIG,
            'movie',
            0,
            {},
            {}
        );

        expect(results).toEqual([]);
        expect(DuckDbProvider.getDuckDbCatalogFromFilters).toHaveBeenCalledTimes(1);
    });

    test('un router Mistral irraggiungibile degrada allo stesso fallback dichiarato', async () => {
        router.routeLiveStremioSearch.mockRejectedValue(new Error('offline'));
        DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValue([]);

        const results = await executeCombinedSearch(
            '__missing_title__',
            { ...USER_CONFIG, apiKeys: { ...USER_CONFIG.apiKeys, mistral: 'configured' } },
            'series',
            0,
            {},
            {}
        );

        expect(results).toEqual([]);
        expect(router.routeLiveStremioSearch).toHaveBeenCalledTimes(1);
        expect(DuckDbProvider.getDuckDbCatalogFromFilters).toHaveBeenCalledWith(
            { text_search: '__missing_title__' },
            'series',
            0,
            20,
            {}
        );
    });
});
