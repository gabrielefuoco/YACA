/**
 * Ticket 21 — la taratura del decadimento: l'alpha del giorno e il reset.
 *
 * La decisione del 20/10: il decadimento resta `0.85^giorni`, ma
 *  a. ogni titolo porta un **alpha del giorno** (deterministico da giorno UTC + id, ±5%) che cambia
 *     l'ordine delle prime pagine di giorno in giorno senza far ballare la pagina fra due refresh;
 *  b. il decadimento vale **solo se il titolo e' ancora in home**: se non compare in pagina 1 da
 *     `DECADIMENTO_RESET_GIORNI_FUORI` giorni, torna al punteggio pieno (il reset), perche' altrimenti i
 *     suggerimenti utili scivolati giu' non tornano piu'.
 */
const {
    applicaDecadimento,
    alphaDelGiorno,
    DECADIMENTO_ALPHA_BANDA,
    DECADIMENTO_RESET_GIORNI_FUORI,
    DECADIMENTO_FATTORE
} = require('../src/pool/impressioni');
const { giornoUTC } = require('../src/profile/impressions');

function giorniFa(n) {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function riga(n = 20) {
    return Array.from({ length: n }, (_, i) => ({
        id: `tmdb:${1000 + i}`,
        tmdbId: 1000 + i,
        punteggio: Number((1 - i * 0.012).toFixed(4))
    }));
}

function inHome(riga_, giorni = 6, ultimo = giornoUTC()) {
    return new Map(riga_.map((i) => [String(i.tmdbId), { giorni, ultimo }]));
}

async function applica(riga_, voci, extra = {}) {
    return applicaDecadimento({
        userId: 'u1',
        profileId: 'p1',
        assigned: { yaca_mondi_movies: riga_ },
        leggi: async () => new Map([['yaca_mondi_movies', voci]]),
        ...extra
    });
}

describe('Ticket 21: la taratura', () => {
    describe("l'alpha del giorno", () => {
        test('sta nella banda dichiarata e non e\' mai negativo', () => {
            for (let id = 1; id <= 200; id += 1) {
                const alpha = alphaDelGiorno(`tmdb:${id}`, '2026-10-20');
                expect(alpha).toBeGreaterThanOrEqual(1 - DECADIMENTO_ALPHA_BANDA);
                expect(alpha).toBeLessThanOrEqual(1 + DECADIMENTO_ALPHA_BANDA);
            }
        });

        test('stesso giorno -> stesso ordine; giorno dopo -> ordine diverso', async () => {
            const r = riga(20);
            const voci = inHome(r);
            const a = await applica(r, voci, { oggi: '2026-10-20' });
            const b = await applica(r, voci, { oggi: '2026-10-20' });
            const c = await applica(r, voci, { oggi: '2026-10-21' });

            const ordine = (x) => x.assigned.yaca_mondi_movies.map((i) => i.tmdbId);
            // due richieste nello stesso giorno: identiche (Stremio non vede la pagina ballare)
            expect(ordine(a)).toEqual(ordine(b));
            // il giorno dopo l'ordine cambia
            expect(ordine(c)).not.toEqual(ordine(a));
        });

        test("non cambia QUALI titoli, solo l'ordine (e nessuno sparisce)", async () => {
            const r = riga(20);
            const { assigned } = await applica(r, new Map(), { oggi: '2026-10-20' });
            const dopo = assigned.yaca_mondi_movies;
            expect(dopo).toHaveLength(r.length);
            expect(new Set(dopo.map((i) => i.tmdbId))).toEqual(new Set(r.map((i) => i.tmdbId)));
        });

        test('il punteggio resta nella banda anche senza impressioni', async () => {
            const r = riga(10);
            const { assigned } = await applica(r, new Map(), { oggi: '2026-10-20' });
            assigned.yaca_mondi_movies.forEach((item, idx) => {
                expect(item.punteggio).toBeGreaterThanOrEqual(r[idx] ? r[idx].punteggio * (1 - DECADIMENTO_ALPHA_BANDA) : 0);
                expect(Math.abs(item.punteggio / item.punteggio_grafo - 1)).toBeLessThanOrEqual(DECADIMENTO_ALPHA_BANDA + 1e-12);
            });
        });
    });

    describe('il reset', () => {
        test('un titolo che non e\' piu\' in home da 5 giorni torna al punteggio pieno', async () => {
            const r = riga(4);
            const voci = new Map([
                [String(r[0].tmdbId), { giorni: 9, ultimo: giorniFa(5) }]
            ]);
            const { assigned, statistiche } = await applica(r, voci, { alphaBanda: 0 });
            const primo = assigned.yaca_mondi_movies[0];
            expect(primo.tmdbId).toBe(r[0].tmdbId);
            expect(primo.punteggio).toBe(r[0].punteggio);     // niente decadimento
            expect(primo.giorni_in_home).toBeUndefined();
            expect(statistiche.riposati).toBe(1);
        });

        test('un titolo ANCORA in home (ieri) decade normalmente', async () => {
            const r = riga(4);
            const ieri = giorniFa(1);
            const voci = new Map([[String(r[0].tmdbId), { giorni: 6, ultimo: ieri }]]);
            const { assigned } = await applica(r, voci, { alphaBanda: 0 });
            const item = assigned.yaca_mondi_movies.find((i) => i.tmdbId === r[0].tmdbId);
            expect(item.giorni_in_home).toBe(6);
            expect(item.punteggio).toBeCloseTo(r[0].punteggio * Math.pow(DECADIMENTO_FATTORE, 6), 6);
        });

        test('il confine: esattamente RESET_GIORNI_FUORI giorni fuori -> decadimento azzerato', async () => {
            const r = riga(4);
            const voci = new Map([[String(r[0].tmdbId), { giorni: 6, ultimo: giorniFa(DECADIMENTO_RESET_GIORNI_FUORI) }]]);
            const { assigned } = await applica(r, voci, { alphaBanda: 0 });
            const item = assigned.yaca_mondi_movies.find((i) => i.tmdbId === r[0].tmdbId);
            expect(item.giorni_in_home).toBeUndefined();
            expect(item.punteggio).toBe(r[0].punteggio);
        });

        test('il reset non ripesca chi non ha mai superato la soglia', async () => {
            const r = riga(4);
            const voci = new Map([[String(r[0].tmdbId), { giorni: 1, ultimo: giorniFa(9) }]]);
            const { assigned, statistiche } = await applica(r, voci);
            expect(statistiche.riposati).toBe(0);
            expect(assigned.yaca_mondi_movies.find((i) => i.tmdbId === r[0].tmdbId).giorni_in_home).toBeUndefined();
        });
    });
});
