/**
 * H9 — injectProfilePreferences trasforma AND in OR sui generi (Live Search AI).
 *
 * Evidenza: AiDiscoveryProvider.js:215-231 — `with_genres` viene splittato con /[|,]/
 * e riunito con '|': una query AI con `with_genres: '35,18'` (AND: commedia E romance)
 * diventa '35|18' (OR: commedia O romance) quando il profilo ha generi top da iniettare.
 * Su TMDB with_genres è un AND → risultati più larghi del richiesto.
 *
 * Test (ROSSO-capace): i filtri che arrivano a DuckDB devono conservare la virgola
 * (gruppo AND originale). Oggi la virgola sparisce.
 */

const { executeCombinedSearch } = require('../src/catalog/providers/AiDiscoveryProvider');

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

jest.mock('../src/models/TmdbScoringData', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/catalog/processors/MetadataHydrator', () => ({
    hydrateResultsFromLocalDetailsCache: jest.fn(async () => {})
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbCatalogFromFilters: jest.fn()
}));

jest.mock('../src/engines/hybridRecommendations', () => ({
    computeTopGenres: jest.fn(() => ['28', '16']),
    computeTopKeywords: jest.fn(() => [])
}));

const router = require('../src/ai/router');
const TasteProfile = require('../src/models/TasteProfile');
const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');

describe('H9 — l\'iniezione profilo trasforma with_genres AND in OR', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('ROSSO: with_genres "35,18" (AND) deve restare AND dopo l\'iniezione dei generi del profilo', async () => {
        TasteProfile.findOne.mockResolvedValue({ owner: 'u1', context: 'global' });
        router.routeLiveStremioSearch.mockResolvedValue({
            filters: {
                queries: [{ strategy: 'discovery', with_genres: '35,18' }]
            }
        });
        DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValue([
            { id: 'tmdb:1', popularity: 5, rawTMDB: { vote_average: 7, genres: [{ id: 35, name: 'Comedy' }] } }
        ]);

        await executeCombinedSearch(
            'commedie romantiche',
            { userId: 'u1', activeProfileId: 'global', apiKeys: { tmdb: 'k', mistral: 'm' } },
            'movie',
            0,
            {},
            {}
        );

        // Il filtro finale passato a DuckDB deve preservare il gruppo AND originale.
        const duckCalls = DuckDbProvider.getDuckDbCatalogFromFilters.mock.calls;
        expect(duckCalls.length).toBeGreaterThan(0);
        const injected = duckCalls.map(c => c[0]).find(f => f && f.with_genres !== undefined);
        expect(injected).toBeDefined();
        expect(injected.with_genres).toContain(',');
    });
});
