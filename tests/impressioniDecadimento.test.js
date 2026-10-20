/**
 * Ticket 14 — il ritorno delle impressioni.
 *
 * IL DIFETTO CHE QUESTA PROVA CHIUDE: `src/profile/impressions.js` scriveva da sempre i titoli serviti in
 * pagina 1 e **nessuno li rileggeva**: dieci giorni di Stremio, stessi titoli in cima. Qui:
 *  1. la finestra si misura in giorni DISTINTI (non in aperture);
 *  2. il decadimento e' 0.85^giorni, solo per chi e' stato in home >= 3 giorni e non e' mai stato visto;
 *  3. nessun titolo sparisce: cambia l'ordine;
 *  4. la riga in cache non viene mutata (il decadimento si applica dopo, per richiesta).
 */
const { aggregaImpressioni, IMPRESSIONI_FINESTRA_GIORNI } = require('../src/profile/impressions');
const { applicaDecadimento, IMPRESSIONI_GIORNI_MINIMI, IMPRESSIONI_FATTORE_GIORNO } = require('../src/pool/impressioni');

function giorniFa(n) {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

describe('Ticket 14: le impressioni tornano indietro', () => {
    describe('la finestra (aggregazione pura)', () => {
        test('conta i giorni distinti dentro la finestra e ignora quelli fuori', () => {
            const soglia = giorniFa(IMPRESSIONI_FINESTRA_GIORNI);
            const perCatalogo = aggregaImpressioni([
                { catalogId: 'yaca_mondi_movies', tmdbId: 603, seenDates: [giorniFa(1), giorniFa(2), giorniFa(3), giorniFa(40)] },
                { catalogId: 'yaca_mondi_movies', tmdbId: 604, seenDates: [giorniFa(40), giorniFa(50)] },
                { catalogId: 'yaca_passo_fuori_movies', tmdbId: 603, seenDates: [giorniFa(2)] }
            ], soglia);

            expect(perCatalogo.get('yaca_mondi_movies').get('603')).toBe(3);
            // tutto fuori finestra: non compare
            expect(perCatalogo.get('yaca_mondi_movies').has('604')).toBe(false);
            // lo stesso titolo in due cataloghi: due conteggi separati
            expect(perCatalogo.get('yaca_passo_fuori_movies').get('603')).toBe(1);
        });

        test('nessuna riga: nessuna impressione (e nessun crash)', () => {
            expect(aggregaImpressioni([], giorniFa(14)).size).toBe(0);
            expect(aggregaImpressioni(null, giorniFa(14)).size).toBe(0);
        });
    });

    describe('il decadimento', () => {
        const riga = () => ([
            { id: 'tmdb:1', tmdbId: 1, punteggio: 1.0 },
            { id: 'tmdb:2', tmdbId: 2, punteggio: 0.99 },
            { id: 'tmdb:3', tmdbId: 3, punteggio: 0.5 },
            { id: 'tmdb:4', tmdbId: 4, punteggio: 0.4 }
        ]);

        async function decadi(impressioni, visti = []) {
            return applicaDecadimento({
                userId: 'u1',
                profileId: 'p1',
                assigned: { yaca_mondi_movies: riga() },
                visti,
                leggi: async () => new Map([['yaca_mondi_movies', new Map(impressioni)]])
            });
        }

        test('0.85^giorni, e chi era primo scende sotto chi non e stato mostrato', async () => {
            // il #1 e' stato in home 5 giorni: 1.0 * 0.85^5 = 0.4437 -> scende sotto il .99 e il .50
            const { assigned } = await decadi([['1', 5]]);
            const ids = assigned.yaca_mondi_movies.map((i) => i.tmdbId);
            expect(ids).toEqual([2, 3, 1, 4]);
            const primo = assigned.yaca_mondi_movies.find((i) => i.tmdbId === 1);
            expect(primo.punteggio).toBeCloseTo(1.0 * Math.pow(IMPRESSIONI_FATTORE_GIORNO, 5), 6);
            expect(primo.punteggio_grafo).toBe(1.0);
            expect(primo.giorni_in_home).toBe(5);
        });

        test('sotto la soglia di giorni non si tocca niente', async () => {
            const { assigned } = await decadi([['1', IMPRESSIONI_GIORNI_MINIMI - 1]]);
            expect(assigned.yaca_mondi_movies.map((i) => i.tmdbId)).toEqual([1, 2, 3, 4]);
            expect(assigned.yaca_mondi_movies[0].punteggio).toBe(1.0);
        });

        test('un titolo GIA VISTO non scende (il decadimento e per i non visti)', async () => {
            const { assigned } = await decadi([['1', 6]], ['1']);
            expect(assigned.yaca_mondi_movies.map((i) => i.tmdbId)).toEqual([1, 2, 3, 4]);
            expect(assigned.yaca_mondi_movies[0].punteggio).toBe(1.0);
        });

        test('nessun titolo sparisce: la riga si rinnova, non si svuota', async () => {
            const { assigned } = await decadi([['1', 6], ['2', 4], ['3', 3]]);
            expect(assigned.yaca_mondi_movies).toHaveLength(4);
            expect(new Set(assigned.yaca_mondi_movies.map((i) => i.tmdbId))).toEqual(new Set([1, 2, 3, 4]));
        });

        test('la riga in cache NON viene mutata (il decadimento e per richiesta)', async () => {
            const cache = { yaca_mondi_movies: riga() };
            await applicaDecadimento({
                userId: 'u1',
                profileId: 'p1',
                assigned: cache,
                leggi: async () => new Map([['yaca_mondi_movies', new Map([['1', 5]])]])
            });
            expect(cache.yaca_mondi_movies[0].punteggio).toBe(1.0);
            expect(cache.yaca_mondi_movies[0].giorni_in_home).toBeUndefined();
        });

        test('le statistiche dichiarano quante righe e quanti giorni', async () => {
            const { statistiche } = await decadi([['1', 5], ['2', 3]]);
            expect(statistiche.titoli).toBe(2);
            expect(statistiche.cataloghi).toBe(1);
            expect(statistiche.giorniMedi).toBe(4);
        });

        test('senza impressioni la riga resta identica (stesso riferimento, nessun lavoro)', async () => {
            const cache = { yaca_mondi_movies: riga() };
            const { assigned, statistiche } = await applicaDecadimento({
                userId: 'u1',
                profileId: 'p1',
                assigned: cache,
                leggi: async () => new Map()
            });
            expect(assigned.yaca_mondi_movies).toBe(cache.yaca_mondi_movies);
            expect(statistiche.titoli).toBe(0);
        });

        test('senza userId non si legge niente (nessuna query inutile)', async () => {
            let chiamate = 0;
            const { assigned } = await applicaDecadimento({
                userId: null,
                assigned: { yaca_mondi_movies: riga() },
                leggi: async () => { chiamate += 1; return new Map(); }
            });
            expect(chiamate).toBe(0);
            expect(assigned.yaca_mondi_movies).toHaveLength(4);
        });
    });
});
