/**
 * H1 — Il VSM di True Blend/Hidden Gems è alimentato con light-meta DuckDB
 * senza keywords/credits/vote_count (scoring "cieco").
 *
 * Evidenza: DuckDbProvider.mapDuckDbRowToMeta (DuckDbProvider.js:148-200) costruisce
 * rawTMDB con soli generi/voti/popolarità; buildFilteredCatalog (catalogStrategies.js:264)
 * scorea `item.rawTMDB || item` senza mai passare da getDuckDbMetaDetails (che HA keywords).
 * ProfileScorer.calculateBaseItemMatch usa keywords (ProfileScorer.js:87-99), credits (:130-146)
 * e vote_count (:156) → tutte assenti nel light-meta.
 *
 * Test 1 (ROSSO-capace): il pool DuckDB passato allo scorer deve contenere keywords e vote_count.
 * Test 2 (verde, documentazione): con meta ricca lo scorer VSM vede le keyword — dimostra che
 * il problema è il dato, non lo scorer.
 */

const catalogStrategies = require('../src/engines/hybrid/catalogStrategies');
const dataFetchers = require('../src/engines/hybrid/dataFetchers');
const ProfileScorer = require('../src/profile/ProfileScorer');
const graph = require('../src/engines/graph/HierarchicalGraph');

jest.mock('../src/clients/tmdb', () => ({
    createTmdbClient: jest.fn(() => ({ get: jest.fn() })),
    getTmdbMovieDetails: jest.fn()
}));

jest.mock('../src/engines/hybrid/dataFetchers', () => ({
    fetchProfileContext: jest.fn(),
    fetchTraktRecommendationsRaw: jest.fn(),
    fetchPopularFallbackIds: jest.fn(),
    fetchHiddenGemsFallbackIds: jest.fn(),
    getImpressionMap: jest.fn().mockResolvedValue(new Map()),
    calculateImpressionPenalty: jest.fn().mockReturnValue(1.0)
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbCatalogFromPreset: jest.fn(),
    getDuckDbCatalogFromFilters: jest.fn(),
    buildPresetFromFilters: jest.fn()
}));

const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');

jest.mock('../src/data/presets', () => ({
    getPresets: jest.fn(() => [])
}));

jest.mock('../src/engines/hybrid/scoringEngine', () => ({
    computeTopGenres: jest.fn(() => ['28']),
    computeTopKeywords: jest.fn(() => []),
    calculateHybridScore: jest.fn(() => 0)
}));

// Riproduce ESATTAMENTE la forma di mapDuckDbRowToMeta (light-meta): niente keywords,
// niente credits, niente vote_count.
function makeLightMeta(id, voteAverage) {
    return {
        id: `tmdb:${id}`,
        _tmdbId: id,
        type: 'movie',
        name: `Movie ${id}`,
        poster: null,
        posterShape: 'poster',
        background: null,
        releaseInfo: '2020',
        imdbRating: voteAverage ? Number(voteAverage).toFixed(1) : undefined,
        genres: ['Action'],
        genre_ids: [28],
        description: '',
        popularity: 100,
        rawTMDB: {
            id,
            title: `Movie ${id}`,
            overview: '',
            poster_path: null,
            backdrop_path: null,
            vote_average: voteAverage,
            popularity: 100,
            release_date: '2020-01-01',
            genres: [{ id: 28, name: 'Action' }],
            belongs_to_collection: null
        }
    };
}

const PROFILE = {
    compiledVectors: { V_final: { 'g:28': 8 } }
};

describe('H1 — scoring cieco sui light-meta DuckDB (True Blend)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('ROSSO: lo scorer deve ricevere keywords e vote_count dal pool DuckDB (oggi riceve light-meta senza)', async () => {
        const spy = jest.spyOn(ProfileScorer, 'calculateItemMatch');

        dataFetchers.fetchProfileContext.mockResolvedValue({
            profile: PROFILE,
            user: { profiles: [{ id: 'ctx', catalogs: [] }] },
            globalProfile: null
        });
        DuckDbProvider.getDuckDbCatalogFromPreset.mockResolvedValue([
            makeLightMeta(101, 9.5),
            makeLightMeta(102, 2.0)
        ]);

        await catalogStrategies.buildTopGenresMixCatalog('u1', 'ctx', 'tmdb-key', 'movie');

        expect(spy).toHaveBeenCalled();
        const callArgs = spy.mock.calls.map(call => call[0]);
        // Ogni item passato allo scorer deve essere idratato (keywords + vote_count),
        // altrimenti la quota tematica gerarchica e l'indieBonus sono ciechi.
        for (const tmdbData of callArgs) {
            expect(tmdbData).toBeDefined();
            expect(typeof tmdbData.vote_count).toBe('number');
            expect(tmdbData.keywords).toBeDefined();
        }

        spy.mockRestore();
    });

    it('verde (documentazione): con meta ricca, un profilo solo-keyword discrimina davvero gli item', () => {
        // Prendiamo un nodo L2 reale e una sua keyword reale dal grafo.
        if (!graph.isLoaded) graph.loadData();
        let nodeId = null;
        let keywordName = null;
        for (const [nid, node] of Object.entries(graph.data.L2 || {})) {
            const kws = new Set();
            for (const l1 of node.children_L1 || []) {
                (graph.data.L1?.[l1]?.keywords || []).forEach(k => kws.add(k));
            }
            if (kws.size > 0) {
                nodeId = nid;
                keywordName = Array.from(kws)[0];
                break;
            }
        }
        expect(nodeId).toBeTruthy();
        expect(keywordName).toBeTruthy();

        const profile = { compiledVectors: { V_final: { [`L2:${nodeId}`]: 25 } } };

        const richItem = {
            id: 1,
            title: 'Rich',
            vote_average: 7,
            genres: [],
            keywords: { results: [{ name: keywordName }] },
            credits: { cast: [], crew: [] }
        };
        const blindItem = {
            id: 2,
            title: 'Blind',
            vote_average: 7,
            genres: [],
            // light-meta: niente keywords/credits
        };

        const richScore = ProfileScorer.calculateItemMatch(richItem, profile, {});
        const blindScore = ProfileScorer.calculateItemMatch(blindItem, profile, {});

        expect(richScore).toBeGreaterThan(blindScore);
    });
});
