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
    casualeDelGiorno,
    serieInCorso,
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

/** Una voce di impressione: `giorni` date consecutive che finiscono a `ultimo`. */
function voce(giorni, ultimo = giornoUTC()) {
    const base = Date.parse(`${ultimo}T00:00:00.000Z`);
    const date = [];
    for (let i = giorni - 1; i >= 0; i -= 1) {
        date.push(new Date(base - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    }
    return { giorni: date.length, ultimo: date[date.length - 1], date };
}

function inHome(riga_, giorni = 6, ultimo = giornoUTC()) {
    return new Map(riga_.map((i) => [String(i.tmdbId), voce(giorni, ultimo)]));
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
            // `ultimo` pinnato allo stesso giorno: altrimenti, passati 4 giorni dal 20/10, tutte le voci
            // sarebbero «fuori» e il test diventerebbe un test dell'alpha travestito.
            const voci = inHome(r, 6, '2026-10-20');
            const a = await applica(r, voci, { oggi: '2026-10-20' });
            const b = await applica(r, voci, { oggi: '2026-10-20' });
            const c = await applica(r, voci, { oggi: '2026-10-21' });

            const ordine = (x) => x.assigned.yaca_mondi_movies.map((i) => i.tmdbId);
            // due richieste nello stesso giorno: identiche (Stremio non vede la pagina ballare)
            expect(ordine(a)).toEqual(ordine(b));
            // il giorno dopo l'ordine cambia
            expect(ordine(c)).not.toEqual(ordine(a));
        });

        test('id vicini non hanno lo stesso alpha (niente spostamenti a blocchi)', () => {
            const ids = Array.from({ length: 400 }, (_, i) => `tmdb:${1000 + i}`);
            const a = ids.map((id) => casualeDelGiorno('2026-10-20', id));
            const b = ids.map((_, i) => casualeDelGiorno('2026-10-20', `tmdb:${1001 + i}`));
            const media = (v) => v.reduce((s, x) => s + x, 0) / v.length;
            const ma = media(a);
            const mb = media(b);
            let num = 0;
            let da = 0;
            let db = 0;
            for (let i = 0; i < a.length; i += 1) {
                num += (a[i] - ma) * (b[i] - mb);
                da += (a[i] - ma) ** 2;
                db += (b[i] - mb) ** 2;
            }
            const correlazione = num / Math.sqrt(da * db);
            // con FNV senza avalanche la correlazione era 0,95: l'alpha era uno spostamento a blocchi
            expect(Math.abs(correlazione)).toBeLessThan(0.3);
            // e due id consecutivi non devono cadere sullo stesso valore per caso
            expect(Math.abs(casualeDelGiorno('2026-10-20', 'tmdb:603') - casualeDelGiorno('2026-10-20', 'tmdb:604'))).toBeGreaterThan(0.001);
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
            assigned.yaca_mondi_movies.forEach((item) => {
                // si confronta con il punteggio del grafo DELLO STESSO titolo (la riga e' riordinata)
                expect(Math.abs(item.punteggio / item.punteggio_grafo - 1)).toBeLessThanOrEqual(DECADIMENTO_ALPHA_BANDA + 1e-12);
            });
        });
    });

    describe('il reset', () => {
        test('un titolo che non e\' piu\' in home da 5 giorni torna al punteggio pieno', async () => {
            const r = riga(4);
            const voci = new Map([[String(r[0].tmdbId), voce(9, giorniFa(5))]]);
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
            const voci = new Map([[String(r[0].tmdbId), voce(6, ieri)]]);
            const { assigned } = await applica(r, voci, { alphaBanda: 0 });
            const item = assigned.yaca_mondi_movies.find((i) => i.tmdbId === r[0].tmdbId);
            expect(item.giorni_in_home).toBe(6);
            expect(item.punteggio).toBeCloseTo(r[0].punteggio * Math.pow(DECADIMENTO_FATTORE, 6), 6);
        });

        test('il confine: esattamente RESET_GIORNI_FUORI giorni fuori -> decadimento azzerato', async () => {
            const r = riga(4);
            const voci = new Map([[String(r[0].tmdbId), voce(6, giorniFa(DECADIMENTO_RESET_GIORNI_FUORI))]]);
            const { assigned } = await applica(r, voci, { alphaBanda: 0 });
            const item = assigned.yaca_mondi_movies.find((i) => i.tmdbId === r[0].tmdbId);
            expect(item.giorni_in_home).toBeUndefined();
            expect(item.punteggio).toBe(r[0].punteggio);
        });

        test("il giorno DOPO il reset non si torna a decadere con l'esponente vecchio", async () => {
            // 9 giorni in home, poi 5 giorni fuori: il reset riporta al punteggio pieno e la serie riparte
            // da 1. Se l'esponente restasse 9, il giorno dopo il titolo crollerebbe a 0.85^10.
            const r = riga(4);
            const voci = new Map([[String(r[0].tmdbId), voce(9, giorniFa(5))]]);
            const oggiDopo = giornoUTC();
            const { assigned } = await applica(r, voci, { alphaBanda: 0, oggi: oggiDopo });
            const item = assigned.yaca_mondi_movies.find((i) => i.tmdbId === r[0].tmdbId);
            expect(item.punteggio).toBe(r[0].punteggio);
            // la serie e' interrotta (fuori casa), e quando torna riparte da 1, non da 9
            const date = voci.get(String(r[0].tmdbId)).date;
            expect(serieInCorso(date, DECADIMENTO_RESET_GIORNI_FUORI, oggiDopo)).toBe(0);
            const dateConRitorno = [...date, oggiDopo];
            expect(serieInCorso(dateConRitorno, DECADIMENTO_RESET_GIORNI_FUORI, oggiDopo)).toBe(1);
        });

        test('il reset non ripesca chi non ha mai superato la soglia', async () => {
            const r = riga(4);
            const voci = new Map([[String(r[0].tmdbId), voce(1, giorniFa(9))]]);
            const { assigned, statistiche } = await applica(r, voci);
            expect(statistiche.riposati).toBe(0);
            expect(assigned.yaca_mondi_movies.find((i) => i.tmdbId === r[0].tmdbId).giorni_in_home).toBeUndefined();
        });
    });
});
