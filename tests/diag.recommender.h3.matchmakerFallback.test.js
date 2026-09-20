/**
 * H3 — Il matchmaker è random e può restare senza carte (nessun fallback).
 *
 * Evidenza: MatchmakerGraphEngine.getCardsForNodes (:67-116) fa UNA sola query per nodo
 * (keyword ILIKE + genere + minVotes) e se rende 0 righe il nodo contribuisce 0 carte;
 * getMatchmakerNextCards (:276) non ha alcun fallback a catena (rilassa keyword → solo genere).
 * Risultato: deck vuoto in alcune combinazioni genere×mood (keyword morte nel dump:
 * 'action', 'relaxing', 'peaceful', 'mind-bending', 'sad', 'heartbreaking').
 *
 * Test (ROSSO-capaci): il simulatore DuckDB rende [] alla query keyword+genere ma ha righe
 * per la query rilassata (solo genere/popolarità). Il motore DEVE ritornare carte di fallback:
 * oggi ritorna cards: [] in entrambi i round.
 */

const { getMatchmakerInitCards, getMatchmakerNextCards } = require('../src/engines/hybrid/MatchmakerGraphEngine');

jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbCatalogFromPreset: jest.fn(),
    getDuckDbCatalogFromFilters: jest.fn()
}));

jest.mock('../src/db/duckDbStore', () => ({
    query: jest.fn(async () => []),
    isInitialized: true,
    init: jest.fn()
}));

const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');

function makeCard(id) {
    return {
        id: `tmdb:${id}`,
        _tmdbId: id,
        type: 'movie',
        name: `Movie ${id}`,
        poster: null,
        releaseInfo: '2021',
        description: '',
        genres: ['Action'],
        genre_ids: [28],
        rawTMDB: { id, genres: [{ id: 28, name: 'Action' }] }
    };
}

// Simula DuckDB: la query con vincolo keyword rende 0 righe (combinazione morta),
// la query rilassata (senza "keywords" ILIKE) ha invece righe disponibili.
function deadKeywordSimulator(preset, skip = 0, limit = 50) {
    const where = (preset.where || []).join(' ');
    if (where.includes('"keywords" ILIKE')) {
        return Promise.resolve([]);
    }
    const pool = [makeCard(8001), makeCard(8002), makeCard(8003), makeCard(8004), makeCard(8005)];
    return Promise.resolve(pool.slice(skip, skip + limit));
}

describe('H3 — matchmaker senza fallback sulle carte vuote', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        DuckDbProvider.getDuckDbCatalogFromPreset.mockImplementation(deadKeywordSimulator);
    });

    it('ROSSO: getMatchmakerInitCards con combinazione genere×mood "morta" deve comunque dare carte (oggi 0)', async () => {
        const cards = await getMatchmakerInitCards('movie', ['Action'], ['Intenso & Ricco d\'Azione'], {});
        expect(cards.length).toBeGreaterThan(0);
    });

    it('ROSSO: getMatchmakerNextCards senza heat map deve dare carte di fallback, non cards: []', async () => {
        const result = await getMatchmakerNextCards('movie', [{ id: 'tmdb:1', action: 'like' }], 'L2', {});
        expect(result.cards.length).toBeGreaterThan(0);
    });

    it('verde (sanity harness): se la query keyword ha righe, il round 1 produce carte', async () => {
        DuckDbProvider.getDuckDbCatalogFromPreset.mockImplementation((preset, skip, limit) => {
            const pool = [makeCard(9001), makeCard(9002), makeCard(9003), makeCard(9004), makeCard(9005)];
            return Promise.resolve(pool.slice(skip, skip + limit));
        });
        const cards = await getMatchmakerInitCards('movie', ['Action'], ['Intenso & Ricco d\'Azione'], {});
        expect(cards.length).toBeGreaterThan(0);
    });
});
