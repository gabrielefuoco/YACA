/**
 * Ticket 22 — i semi che il grafo non conosce diventano i loro vicini.
 *
 * Perché questi test esistono: l'espansione è l'unico punto in cui un titolo fuori canone entra
 * nella raccomandazione. Se sbaglia i pesi, il seme nuovo pesa più o meno di quello che l'utente ha
 * davvero guardato — e nessun numero a valle lo direbbe.
 */

const { espandiSemi, caricaVoci } = require('../src/pool/semiNuovi');

const VOCI = {
    'movie:999': {
        medio: 'movie',
        vicini: [{ chiave: 'movie:1', peso: 3 }, { chiave: 'movie:2', peso: 1 }],
    },
};

describe('espansione dei semi fuori canone', () => {
    test('un seme ignoto viene sostituito dai suoi vicini', () => {
        const r = espandiSemi([{ key: 'movie:999', plays: 2 }], VOCI);
        expect(r.espansi).toEqual(['movie:999']);
        expect(r.semi.map(s => s.key)).toEqual(['movie:1', 'movie:2']);
        expect(r.semi.every(s => s.da_titolo_nuovo === 'movie:999')).toBe(true);
    });

    test('il peso totale del seme si conserva: un titolo nuovo non pesa più di uno guardato', () => {
        const r = espandiSemi([{ key: 'movie:999', plays: 2 }], VOCI);
        const totale = r.semi.reduce((s, x) => s + x.plays, 0);
        expect(totale).toBeCloseTo(2, 10);
        // distribuito per peso, non a metà: 3:1
        expect(r.semi[0].plays).toBeCloseTo(1.5, 10);
        expect(r.semi[1].plays).toBeCloseTo(0.5, 10);
    });

    test('il segnale resta quello dell\'utente: l\'età non viene riscritta', () => {
        const r = espandiSemi([{ key: 'movie:999', plays: 1, eta_giorni: 7 }], VOCI);
        expect(r.semi.every(s => s.eta_giorni === 7)).toBe(true);
    });

    test('i semi già noti passano intatti, e l\'ordine non cambia', () => {
        const r = espandiSemi([{ key: 'movie:1', plays: 1 }, { key: 'movie:999', plays: 1 }], VOCI);
        expect(r.semi[0]).toEqual({ key: 'movie:1', plays: 1 });
        expect(r.espansi).toEqual(['movie:999']);
    });

    test('senza sidecar non cambia niente (il caso normale)', () => {
        const semi = [{ key: 'movie:1', plays: 1 }, { key: 'tv:1396', plays: 2 }];
        const r = espandiSemi(semi, {});
        expect(r.semi).toEqual(semi);
        expect(r.espansi).toEqual([]);
    });

    test('una voce senza vicini non viene usata: meglio lo scarto rumoroso del seme sbagliato', () => {
        const voci = { 'movie:999': { medio: 'movie', vicini: [] } };
        const r = espandiSemi([{ key: 'movie:999', plays: 1 }], voci);
        expect(r.semi).toEqual([]);
        expect(r.scartati).toEqual(['movie:999']);
    });

    test('un file mancante non fa cadere niente: si carica vuoto', () => {
        expect(caricaVoci('/percorso/che/non/esiste.json')).toEqual({});
    });
});
