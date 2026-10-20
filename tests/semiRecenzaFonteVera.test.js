/**
 * Ticket 07 — la recenza dei semi parte dalla FONTE VERA (WatchHistory), non da un mock di `semiDi`.
 *
 * `tests/ultimeVisioniRecenza.test.js` prova la selezione (ordine di Map, date permutate, taglio fra i
 * semi inviati) su mappe già pronte. Qui si prova il pezzo a monte: che `semiDi` legga davvero le date di
 * visione, che un'aggiunta in watchlist NON sia una visione (il ticket lo dichiara), e che una aggiunta
 * in libreria non sovrascriva la data di una visione vera.
 */
let mockHistoryDocs = [];

const mockHistoryFind = jest.fn(() => ({ lean: async () => mockHistoryDocs }));
const mockLibraryFind = jest.fn(() => ({ lean: async () => [] }));

jest.mock('../src/library/models', () => ({
    WatchHistory: { getModel: () => ({ db: { readyState: 1 }, find: mockHistoryFind }) },
    UserLibraryItem: { getModel: () => ({ db: { readyState: 1 }, find: mockLibraryFind }) }
}));

const library = require('../src/library');
const { convertiSemiPerGrafo } = require('../src/pool');

// Date vere: WatchHistory restituisce Date, e `getSeedTimestamp` legge Date (o stringhe parsabili).
const VECCHIO = new Date('2025-01-01T12:00:00Z');
const MEZZO = new Date('2026-03-01T12:00:00Z');
const NUOVO = new Date('2026-10-18T12:00:00Z');

function doc(tmdbId, signals) {
    const ultimo = signals.length > 0 ? new Date(signals[0].at) : VECCHIO;
    return {
        owner: 'u1',
        context: 'global',
        tmdbId,
        type: 'movie',
        lastWatchedAt: ultimo,
        signals
    };
}

async function conStoria(docs, opzioni = {}) {
    mockHistoryDocs = docs;
    return library.semiDi({ userId: 'u1', context: 'global', medium: 'movie', user: { uuid: 'addon-1' }, ...opzioni });
}

/** `tipi` come lo consegna `semiDi` (Ticket 17): nei fixture il tipo e' quello che il test ha scritto. */
function tipiDa(seeds) {
    const m = new Map();
    for (const id of seeds.keys()) m.set(String(id), 'watched');
    return m;
}

describe('Ticket 07: la recenza viene dalle date vere di WatchHistory', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockHistoryDocs = [];
    });

    test('semiDi espone ultimaVisione con la data della visione', async () => {
        const { seeds, ultimaVisione } = await conStoria([
            doc(101, [{ type: 'watched', at: NUOVO }])
        ]);

        expect(seeds.has('101')).toBe(true);
        expect(ultimaVisione).toBeInstanceOf(Map);
        expect(ultimaVisione.get('101')).toBe(NUOVO.getTime());
    });

    test("un'aggiunta in watchlist non e' una visione", async () => {
        const { ultimaVisione } = await conStoria([
            doc(201, [{ type: 'library', at: NUOVO }])
        ]);

        expect(ultimaVisione.has('201')).toBe(false);
    });

    test("l'aggiunta in libreria non sovrascrive la data di una visione vera", async () => {
        const { ultimaVisione } = await conStoria([
            doc(301, [
                { type: 'library', at: NUOVO },   // aggiunto alla watchlist ieri
                { type: 'watched', at: VECCHIO }  // ma visto davvero tanto tempo fa
            ])
        ]);

        expect(ultimaVisione.get('301')).toBe(VECCHIO.getTime());
    });

    test('il taglio dei recenti usa le date, non l\'ordine dei documenti', async () => {
        const { seeds, ultimaVisione } = await conStoria([
            doc(401, [{ type: 'watched', at: NUOVO }]),
            doc(402, [{ type: 'watched', at: VECCHIO }]),
            doc(403, [{ type: 'watched', at: MEZZO }])
        ]);

        const semi = convertiSemiPerGrafo(seeds, { medium: 'movie', ultimaVisione, quantiRecenti: 2, tipi: tipiDa(seeds) });
        const recenti = semi.filter((s) => s.recente === true).map((s) => s.tmdbId).sort();
        expect(recenti).toEqual([401, 403]);
    });

    test('una visione senza data non entra fra i recenti', async () => {
        const senzaData = {
            owner: 'u1',
            context: 'global',
            tmdbId: 501,
            type: 'movie',
            lastWatchedAt: null,
            signals: [{ type: 'watched' }]
        };
        const { seeds, ultimaVisione } = await conStoria([
            senzaData,
            doc(502, [{ type: 'watched', at: NUOVO }])
        ]);

        expect(ultimaVisione.has('501')).toBe(false);
        const semi = convertiSemiPerGrafo(seeds, { medium: 'movie', ultimaVisione, tipi: tipiDa(seeds) });
        const recenti = semi.filter((s) => s.recente === true).map((s) => s.tmdbId);
        expect(recenti).toEqual([502]);
    });

    test('la finestra dei 15 e\' una costante dichiarata, non un numero sparso', () => {
        expect(library.SEED_RECENTI_QUANTI).toBe(15);
    });
});
