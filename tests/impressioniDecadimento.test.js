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
const mongoose = require('mongoose');
const RecommendationImpression = require('../src/models/RecommendationImpression');
const {
    aggregaImpressioni, leggiImpressioniRecenti, giornoUTC, IMPRESSIONI_FINESTRA_GIORNI
} = require('../src/profile/impressions');
const { applicaDecadimento, DECADIMENTO_GIORNI_MINIMI, DECADIMENTO_FATTORE } = require('../src/pool/impressioni');

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
            expect(primo.punteggio).toBeCloseTo(1.0 * Math.pow(DECADIMENTO_FATTORE, 5), 6);
            expect(primo.punteggio_grafo).toBe(1.0);
            expect(primo.giorni_in_home).toBe(5);
        });

        test('sotto la soglia di giorni non si tocca niente', async () => {
            const { assigned } = await decadi([['1', DECADIMENTO_GIORNI_MINIMI - 1]]);
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
            expect(statistiche.spostamenti).toBeGreaterThan(0);
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

    describe('la lettura vera (query e guardie)', () => {
        const originale = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');

        afterEach(() => {
            jest.restoreAllMocks();
            if (originale) Object.defineProperty(mongoose.connection, 'readyState', originale);
            Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });
        });

        test('la finestra e i filtri passano nella query, e i giorni sono un insieme', async () => {
            Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
            const find = jest.spyOn(RecommendationImpression, 'find').mockReturnValue({
                lean: async () => ([
                    // tre date di cui due ripetute: conta 2 giorni, non 3
                    { catalogId: 'yaca_mondi_movies', tmdbId: '603', seenDates: [giornoUTC(), giornoUTC(), giorniFa(2)] },
                    { catalogId: 'yaca_mondi_movies', tmdbId: '604', seenDates: [giorniFa(1)] }
                ])
            });

            const risultato = await leggiImpressioniRecenti({
                userId: 'u1',
                profileId: 'p1',
                catalogIds: ['yaca_mondi_movies', 'yaca_passo_fuori_movies'],
                giorni: 7
            });

            expect(risultato.get('yaca_mondi_movies').get('603')).toBe(2);
            expect(risultato.get('yaca_mondi_movies').get('604')).toBe(1);
            const filtro = find.mock.calls[0][0];
            expect(filtro.owner).toBe('u1');
            expect(filtro.profileId).toBe('p1');
            expect(filtro.catalogId).toEqual({ $in: ['yaca_mondi_movies', 'yaca_passo_fuori_movies'] });
            // finestra di 7 giornate: oggi e i sei giorni prima
            expect(filtro.seenDates.$gte).toBe(giorniFa(6));
        });

        test('un profilo senza id legge "global" (lo stesso che scrive)', async () => {
            Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
            const find = jest.spyOn(RecommendationImpression, 'find').mockReturnValue({ lean: async () => [] });
            await leggiImpressioniRecenti({ userId: 'u1', profileId: undefined });
            expect(find.mock.calls[0][0].profileId).toBe('global');
        });

        test('senza connessione NON interroga (niente query in buffer)', async () => {
            const find = jest.spyOn(RecommendationImpression, 'find').mockReturnValue({ lean: async () => [] });
            const risultato = await leggiImpressioniRecenti({ userId: 'u1', profileId: 'p1' });
            expect(find).not.toHaveBeenCalled();
            expect(risultato.size).toBe(0);
        });

        test('un elenco di cataloghi vuoto non diventa "tutti"', async () => {
            Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
            const find = jest.spyOn(RecommendationImpression, 'find').mockReturnValue({ lean: async () => [] });
            const risultato = await leggiImpressioniRecenti({ userId: 'u1', profileId: 'p1', catalogIds: [] });
            expect(find).not.toHaveBeenCalled();
            expect(risultato.size).toBe(0);
        });

        test('un guasto di lettura dichiara e prosegue senza decadimento', async () => {
            Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
            jest.spyOn(RecommendationImpression, 'find').mockImplementation(() => {
                throw new Error('mongo giu');
            });
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const risultato = await leggiImpressioniRecenti({ userId: 'u1', profileId: 'p1' });
            expect(risultato.size).toBe(0);
            expect(warn.mock.calls.map((c) => String(c[0])).join(' ')).toContain('lettura fallita');
        });
    });

    describe('difese sul payload', () => {
        test('un `visti` corrotto non fa cadere la porta del pool', async () => {
            const riga = [{ id: 'tmdb:1', tmdbId: 1, punteggio: 1.0 }, { id: 'tmdb:2', tmdbId: 2, punteggio: 0.9 }];
            const { assigned } = await applicaDecadimento({
                userId: 'u1',
                profileId: 'p1',
                assigned: { yaca_mondi_movies: riga },
                visti: 'spazzatura',
                leggi: async () => new Map([['yaca_mondi_movies', new Map([['1', 5]])]])
            });
            expect(assigned.yaca_mondi_movies.map((i) => i.tmdbId)).toEqual([2, 1]);
        });

        test('una riga con un titolo SENZA punteggio non viene riordinata', async () => {
            const riga = [
                { id: 'tmdb:9', tmdbId: 9 },
                { id: 'tmdb:1', tmdbId: 1, punteggio: 1.0 },
                { id: 'tmdb:2', tmdbId: 2, punteggio: 0.9 }
            ];
            const { assigned, statistiche } = await applicaDecadimento({
                userId: 'u1',
                profileId: 'p1',
                assigned: { yaca_mondi_movies: riga },
                leggi: async () => new Map([['yaca_mondi_movies', new Map([['1', 5]])]])
            });
            // il titolo senza punteggio resta primo: non e' ne' primo ne' ultimo in classifica
            expect(assigned.yaca_mondi_movies.map((i) => i.tmdbId)).toEqual([9, 1, 2]);
            expect(statistiche.righeNonOrdinate).toBe(1);
        });
    });

    describe('il rinnovo della pagina (Ticket 14, punto 3)', () => {
        test('un titolo dalla posizione 25 entra in pagina 1 quando i primi 20 scendono', () => {
            // pagina 1 del prodotto = ITEMS_PER_PAGE (20). Riga di 40 titoli, i primi 20 in home da 6 giorni.
            const riga = Array.from({ length: 40 }, (_, i) => ({
                id: `tmdb:${1000 + i}`,
                tmdbId: 1000 + i,
                punteggio: Number((1 - i * 0.012).toFixed(4))
            }));
            const inHome = new Map(riga.slice(0, 20).map((i) => [String(i.tmdbId), 6]));
            const posizionePrima = new Map(riga.map((i, idx) => [i.tmdbId, idx + 1]));

            return applicaDecadimento({
                userId: 'u1',
                profileId: 'p1',
                assigned: { yaca_mondi_movies: riga },
                leggi: async () => new Map([['yaca_mondi_movies', inHome]])
            }).then(({ assigned }) => {
                const dopo = assigned.yaca_mondi_movies;
                // il #25 di ieri e' in pagina 1 oggi
                const venticinquesimo = riga[24].tmdbId;
                const posto = dopo.findIndex((i) => i.tmdbId === venticinquesimo) + 1;
                expect(posizionePrima.get(venticinquesimo)).toBe(25);
                expect(posto).toBeLessThanOrEqual(20);
                // e la riga resta intera
                expect(dopo).toHaveLength(40);
            });
        });
    });
});
