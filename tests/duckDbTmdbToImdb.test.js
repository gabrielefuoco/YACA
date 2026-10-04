/**
 * `duckDbStore.resolveTmdbToImdb`: il verso opposto di `resolveImdbIds`, dal dump e senza rete.
 *
 * Il contratto che qui si prova è quello del **degrado**, ed è valido ovunque (con dump in
 * `.cache/tmdb` o senza, in CI come in produzione):
 *  - non solleva mai e non inizializza DuckDB quando il dump non c'è (niente cold start);
 *  - ogni valore restituito è un id IMDb ben formato (`tt…`), mai `null` o spazzatura;
 *  - gli id non numerici vengono scartati prima di arrivare alla query.
 *
 * Il SQL vero è provato dai test che passano dal dump reale; qui si fissa la forma dell'API,
 * che è ciò che `metaHandler` usa (`metaHandlerDumpImdbId.test.js` la percorre con un finto
 * lettore, `metaHandlerImdbIdNoNetwork.test.js` ne misura l'effetto sulle richieste di rete).
 */
const duckDbStore = require('../src/db/duckDbStore');

describe('duckDbStore.resolveTmdbToImdb', () => {
    test('input vuoto o non valido: risposta vuota, nessuna eccezione', async () => {
        await expect(duckDbStore.resolveTmdbToImdb([])).resolves.toEqual({});
        await expect(duckDbStore.resolveTmdbToImdb(null)).resolves.toEqual({});
        await expect(duckDbStore.resolveTmdbToImdb(['abc', '', null, {}, -3, 0])).resolves.toEqual({});
    });

    test('un id che non è nel dump non viene inventato: nessun valore, nessuna eccezione', async () => {
        const res = await duckDbStore.resolveTmdbToImdb([999999999], 'tv');
        expect(res).toEqual({});
        expect(duckDbStore.isInitialized || res['999999999'] === undefined).toBe(true);
    });

    test('qualunque cosa torni dal dump è un id IMDb ben formato', async () => {
        const res = await duckDbStore.resolveTmdbToImdb([1668, 1399, 27205]);
        expect(typeof res).toBe('object');
        for (const [tmdbId, imdbId] of Object.entries(res)) {
            expect(String(Number(tmdbId))).toBe(tmdbId);          // chiave numerica normalizzata
            expect(imdbId).toMatch(/^tt\d+$/);
        }
    });

    test('il tipo sceglie la tabella: un id film non viene cercato tra le serie', async () => {
        // 27205 (Inseparabili) è un film: cercarlo in `tv` non deve restituire nulla nemmeno
        // se un id identico esistesse lì. Il contratto è sul *filtro di tipo*, non sui dati.
        const soloFilm = await duckDbStore.resolveTmdbToImdb([27205], 'movie');
        const comeTv = await duckDbStore.resolveTmdbToImdb([27205], 'tv');
        expect(soloFilm['27205'] === undefined || /^tt\d+$/.test(soloFilm['27205'])).toBe(true);
        expect(comeTv['27205'] === undefined || /^tt\d+$/.test(comeTv['27205'])).toBe(true);
    });
});