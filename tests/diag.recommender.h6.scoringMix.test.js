/**
 * H6 — Nel Seed Network il punteggio ibrido (0–135+) domina lo score VSM (0–10).
 *
 * Evidenza: catalogStrategies.js:415 ordina per `(score + hybridScore)`;
 * calculateHybridScore (scoringEngine.js:38-63) somma posizione (fino a 50),
 * 100/2^(peso-1) (fino a 100) e boost generi (30/15/5). Lo score VSM (0-10)
 * è un tie-break de facto → il catalogo ignora i topoi e `_yacaMatch` non
 * corrisponde all'ordine mostrato.
 *
 * Test (ROSSO-capace, se l'intento è VSM-first): candidato A con VSM perfetto
 * (score 10) ma hybridScore 0 deve stare DAVANTI a B con VSM nullo (score 0)
 * ma hybridScore 100. Oggi vince B.
 */

const catalogStrategies = require('../src/engines/hybrid/catalogStrategies');
const tmdb = require('../src/clients/tmdb');
const dataFetchers = require('../src/engines/hybrid/dataFetchers');
const ProfileScorer = require('../src/profile/ProfileScorer');

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
    getDuckDbCatalogFromPreset: jest.fn().mockResolvedValue([]),
    getDuckDbCatalogFromFilters: jest.fn(),
    buildPresetFromFilters: jest.fn()
}));

jest.mock('../src/data/presets', () => ({
    getPresets: jest.fn(() => [])
}));

jest.mock('../src/engines/hybrid/scoringEngine', () => ({
    computeTopGenres: jest.fn(() => []),
    computeTopKeywords: jest.fn(() => []),
    calculateHybridScore: jest.fn()
}));

jest.mock('../src/profile/ProfileScorer', () => ({
    computeDnaMultiplier: jest.fn(() => 1.0),
    calculateItemMatch: jest.fn()
}));

const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');
const scoringEngine = require('../src/engines/hybrid/scoringEngine');

describe('H6 — hybridScore (0-135+) domina lo score VSM (0-10) nel Seed Network', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('ROSSO: un candidato VSM-perfetto deve battere un candidato VSM-nullo anche con hybridScore basso', async () => {
        // A: score VSM 10, hybridScore 0. B: score VSM 0, hybridScore 100.
        dataFetchers.fetchProfileContext.mockResolvedValue({
            profile: { compiledVectors: { V_final: {} } },
            user: { profiles: [{ id: 'global', loved: [500], liked: [] }] },
            globalProfile: null
        });
        dataFetchers.fetchTraktRecommendationsRaw.mockResolvedValue([]);

        const A = { id: 9001, title: 'A — VSM perfetto', genre_ids: [99] };
        const B = { id: 9002, title: 'B — solo ibrido', genre_ids: [99] };
        DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValue([A, B]);

        scoringEngine.calculateHybridScore.mockImplementation((item) =>
            item.tmdbId === 9001 ? 0 : 100
        );
        ProfileScorer.calculateItemMatch.mockImplementation((item) =>
            item.id === 9001 ? 10.0 : 0.0
        );
        tmdb.getTmdbMovieDetails.mockImplementation((key, id) =>
            Promise.resolve({ id, genre_ids: [99], vote_average: 7 })
        );

        const result = await catalogStrategies.buildHybridCatalog('u1', 'global', 'trakt', 'tmdb-key', 'movie');
        const ids = result.map(r => (typeof r === 'object' ? String(r.id) : String(r)));

        // Intento VSM-first: A (score 10) davanti a B (score 0) nonostante hybridScore 100.
        expect(ids[0]).toBe('9001');
    });

    it('verde (documentazione): comportamento attuale — B con hybridScore 100 batte A con VSM 10', async () => {
        dataFetchers.fetchProfileContext.mockResolvedValue({
            profile: { compiledVectors: { V_final: {} } },
            user: { profiles: [{ id: 'global', loved: [500], liked: [] }] },
            globalProfile: null
        });
        dataFetchers.fetchTraktRecommendationsRaw.mockResolvedValue([]);

        const A = { id: 9001, title: 'A — VSM perfetto', genre_ids: [99] };
        const B = { id: 9002, title: 'B — solo ibrido', genre_ids: [99] };
        DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValue([A, B]);

        scoringEngine.calculateHybridScore.mockImplementation((item) =>
            item.tmdbId === 9001 ? 0 : 100
        );
        ProfileScorer.calculateItemMatch.mockImplementation((item) =>
            item.id === 9001 ? 10.0 : 0.0
        );
        tmdb.getTmdbMovieDetails.mockImplementation((key, id) =>
            Promise.resolve({ id, genre_ids: [99], vote_average: 7 })
        );

        const result = await catalogStrategies.buildHybridCatalog('u1', 'global', 'trakt', 'tmdb-key', 'movie');
        const ids = result.map(r => (typeof r === 'object' ? String(r.id) : String(r)));

        expect(ids[0]).toBe('9002');
    });
});
