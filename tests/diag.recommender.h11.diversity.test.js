/**
 * H11 — Nessuna diversificazione nel top-k dei cataloghi hero (niente MMR/cap).
 *
 * Evidenza: nessun meccanismo di diversificazione nei percorsi hero. Grep su src/:
 * ProfileScorer.applyDiversityCaps (ProfileScorer.js:309) è definita ma MAI chiamata;
 * nessun riferimento MMR. buildFilteredCatalog ordina per score e fa slice(0,100)
 * (catalogStrategies.js:263-270); buildHybridCatalog idem con score+hybridScore (:413-417).
 * Unica mitigazione: deduplicateByCollection (solo saghe). Con H1 attiva lo score è
 * dominato dall'affinità di genere → il top-k collassa sul genere dominante
 * ("i risultati, anche per sottogeneri, erano sempre troppo simili tra loro").
 *
 * Test (ROSSO-capaci): pool con 5 item Azione a score 9 e 15 item di ALTRI generi a
 * score 5 → i primi 5 di "Scelti per Te" devono contenere più di un genere distinto
 * (oggi: 5/5 Azione). E applyDiversityCaps non viene mai invocata.
 */

const catalogStrategies = require('../src/engines/hybrid/catalogStrategies');
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
    getDuckDbCatalogFromPreset: jest.fn(),
    getDuckDbCatalogFromFilters: jest.fn(),
    buildPresetFromFilters: jest.fn()
}));

jest.mock('../src/data/presets', () => ({
    getPresets: jest.fn(() => [])
}));

jest.mock('../src/engines/hybrid/scoringEngine', () => ({
    computeTopGenres: jest.fn(() => ['28']),
    computeTopKeywords: jest.fn(() => []),
    calculateHybridScore: jest.fn(() => 0)
}));

const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');

const GENRES = {
    28: 'Action',
    35: 'Comedy',
    18: 'Drama',
    878: 'Science Fiction',
    16: 'Animation',
    27: 'Horror'
};

function makeLightMeta(id, genreId) {
    return {
        id: `tmdb:${id}`,
        _tmdbId: id,
        type: 'movie',
        name: `Movie ${id}`,
        poster: null,
        releaseInfo: '2020',
        genres: [GENRES[genreId]],
        genre_ids: [genreId],
        description: '',
        popularity: 100,
        rawTMDB: {
            id,
            title: `Movie ${id}`,
            overview: '',
            vote_average: 7,
            popularity: 100,
            release_date: '2020-01-01',
            genres: [{ id: genreId, name: GENRES[genreId] }]
        }
    };
}

// Pool: 5 item Azione (score 9) + 15 item di 5 altri generi (score 5).
const POOL = [
    ...Array.from({ length: 5 }, (_, i) => makeLightMeta(100 + i, 28)),
    ...Array.from({ length: 15 }, (_, i) => makeLightMeta(200 + i, [35, 18, 878, 16, 27][i % 5]))
];

describe('H11 — nessuna diversificazione nel top-k', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        dataFetchers.fetchProfileContext.mockResolvedValue({
            profile: { compiledVectors: { V_final: { 'g:28': 8 } } },
            user: { profiles: [{ id: 'ctx', catalogs: [] }] },
            globalProfile: null
        });
        DuckDbProvider.getDuckDbCatalogFromPreset.mockResolvedValue(POOL);
        // Lo scorer reale assegna affinità alta al genere dominante del profilo (28).
        jest.spyOn(ProfileScorer, 'calculateItemMatch').mockImplementation((item) => {
            const gids = (item.genre_ids || (item.genres || []).map(g => (typeof g === 'object' ? g.id : g))).map(Number);
            return gids.includes(28) ? 9.0 : 5.0;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('ROSSO: i primi 5 di "Scelti per Te" devono contenere più di un genere distinto', async () => {
        const result = await catalogStrategies.buildTopGenresMixCatalog('u1', 'ctx', 'tmdb-key', 'movie');
        expect(result.length).toBeGreaterThanOrEqual(5);

        const top5Genres = new Set();
        for (const r of result.slice(0, 5)) {
            const raw = r.rawTMDB || r;
            for (const g of raw.genres || []) {
                top5Genres.add(typeof g === 'object' ? g.id : g);
            }
        }
        expect(top5Genres.size).toBeGreaterThan(1);
    });

    it('ROSSO: esiste un meccanismo di diversificazione e viene applicato al top-k (applyDiversityCaps mai chiamata oggi)', async () => {
        const spy = jest.spyOn(ProfileScorer, 'applyDiversityCaps');

        await catalogStrategies.buildTopGenresMixCatalog('u1', 'ctx', 'tmdb-key', 'movie');

        // applyDiversityCaps è l'unico meccanismo esistente: oggi non viene mai chiamato
        // (e non esiste nessun MMR). Dopo la fix deve essere invocata sul top-k.
        expect(spy).toHaveBeenCalled();

        spy.mockRestore();
    });
});
