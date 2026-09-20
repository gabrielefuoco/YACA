/**
 * H3b — I generi sono movie-oriented: per serie/anime il matchmaker dà 0 carte
 * e i cataloghi hero si svuotano nel fallback popolare.
 *
 * Evidenza: la UI passa nomi inglesi di generi FILM anche per le serie
 * (MatchmakerModal.tsx:37-43); il backend filtra per nome esatto
 * (applyFunnelFiltersToPreset → F.genreStr → "genres" ILIKE '%"name":"Action"%').
 * Su TMDB le serie usano nomi composti ("Action & Adventure") → `"name":"Action"` non matcha
 * (manca la virgoletta dopo "Action"). La mappa cross-type esiste ma è inutilizzata:
 * G._movieToTv (filters.js:80-91) non è referenziata fuori da filters.js.
 * Nei cataloghi: fetchSmartAndPool/buildHybridCatalog filtrano con F.genre(Number(g))
 * (catalogStrategies.js:194,313) senza convertire movie→tv, quindi il pool tv si azzera.
 *
 * Il simulatore DuckDB qui sotto ha una riga TV `{"id":10759,"name":"Action & Adventure"}`
 * e applica la semantica LIKE/ILIKE dei filtri reali.
 */

const { getMatchmakerInitCards } = require('../src/engines/hybrid/MatchmakerGraphEngine');
const catalogStrategies = require('../src/engines/hybrid/catalogStrategies');

jest.mock('../src/clients/tmdb', () => ({
    createTmdbClient: jest.fn(() => ({ get: jest.fn() })),
    getTmdbMovieDetails: jest.fn()
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbCatalogFromPreset: jest.fn(),
    getDuckDbCatalogFromFilters: jest.fn(),
    buildPresetFromFilters: jest.fn()
}));

jest.mock('../src/db/duckDbStore', () => ({
    query: jest.fn(async () => []),
    isInitialized: true,
    init: jest.fn()
}));

jest.mock('../src/data/presets', () => ({
    getPresets: jest.fn(() => [])
}));

jest.mock('../src/engines/hybrid/dataFetchers', () => ({
    fetchProfileContext: jest.fn(),
    fetchTraktRecommendationsRaw: jest.fn(),
    fetchPopularFallbackIds: jest.fn(),
    fetchHiddenGemsFallbackIds: jest.fn(),
    getImpressionMap: jest.fn().mockResolvedValue(new Map()),
    calculateImpressionPenalty: jest.fn().mockReturnValue(1.0)
}));

const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');
const dataFetchers = require('../src/engines/hybrid/dataFetchers');

function makeTvMeta(id) {
    const genres = [{ id: 10759, name: 'Action & Adventure' }];
    return {
        id: `tmdb:${id}`,
        _tmdbId: id,
        type: 'series',
        name: `TV Show ${id}`,
        poster: null,
        posterShape: 'poster',
        background: null,
        releaseInfo: '2023',
        imdbRating: '7.5',
        genres: genres.map(g => g.name),
        genre_ids: genres.map(g => g.id),
        description: '',
        popularity: 100,
        rawTMDB: {
            id,
            title: `TV Show ${id}`,
            name: `TV Show ${id}`,
            overview: '',
            vote_average: 7.5,
            popularity: 100,
            first_air_date: '2023-01-01',
            genres
        }
    };
}

const TV_ROWS = [makeTvMeta(7001), makeTvMeta(7002), makeTvMeta(7003), makeTvMeta(7004), makeTvMeta(7005)];

// Semantica LIKE/ILIKE simulata sui filtri reali prodotti da F.genre / F.genreStr.
function simulateDuckDb(preset, skip = 0, limit = 50) {
    const where = (preset.where || []).join(' ');
    const isTv = preset.type === 'tv' || preset.type === 'series';
    if (!isTv) return Promise.resolve([]);

    const queriedIds = [...where.matchAll(/"id":\s*(\d+)/g)].map(m => Number(m[1]));
    const queriedNames = [...where.matchAll(/"name":"([^"]+)"/g)].map(m => m[1]);

    const matched = TV_ROWS.filter(r => {
        const gids = (r.rawTMDB.genres || []).map(g => g.id);
        const gnames = (r.rawTMDB.genres || []).map(g => g.name);
        if (queriedIds.length > 0 && !queriedIds.some(q => gids.includes(q))) return false;
        if (queriedNames.length > 0 && !queriedNames.some(q => gnames.includes(q))) return false;
        return true;
    });
    return Promise.resolve(matched.slice(skip, skip + limit));
}

describe('H3b — mapping generi movie→tv assente', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        DuckDbProvider.getDuckDbCatalogFromPreset.mockImplementation(simulateDuckDb);
    });

    it('ROSSO: getMatchmakerInitCards tv con genere "Action" deve dare >0 carte (riga TV "Action & Adventure" esiste; oggi 0)', async () => {
        const cards = await getMatchmakerInitCards('tv', ['Action'], ['Intenso & Ricco d\'Azione'], {});
        expect(cards.length).toBeGreaterThan(0);
    });

    it('verde (documentazione): il matchmaker funziona se gli si passa il nome TV composto', async () => {
        const cards = await getMatchmakerInitCards('tv', ['Action & Adventure'], ['Intenso & Ricco d\'Azione'], {});
        expect(cards.length).toBeGreaterThan(0);
    });

    it('ROSSO: profilo con top genre film 28 + "Scelti per Te (Serie)" deve servire le serie equivalenti, non il fallback popolare', async () => {
        dataFetchers.fetchProfileContext.mockResolvedValue({
            profile: { compiledVectors: { V_final: { 'g:28': 9 } } },
            user: { profiles: [{ id: 'ctx', catalogs: [] }] },
            globalProfile: null
        });
        dataFetchers.fetchPopularFallbackIds.mockResolvedValue([{ id: 'pop-1' }]);

        const result = await catalogStrategies.buildTopGenresMixCatalog('u1', 'ctx', 'tmdb-key', 'series');
        const ids = result.map(r => (typeof r === 'object' ? r.id : r));
        expect(ids).toContain('7001');
        expect(ids).not.toContain('pop-1');
    });
});
