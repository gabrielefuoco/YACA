/**
 * tests/pushDiffInCoda.test.js
 *
 * Il ponte fra il diff del servizio doppiaggi e la coda degli eventi dell'app:
 * `ita_annotations.diff.json` -> `push({tipo, id, badge})`.
 *
 * Qui conta il contratto che un timer pretende:
 * - un artefatto di N cambiamenti mette in coda N eventi, col badge giusto (`null` vuol dire
 *   "togli il badge", non "non so");
 * - **rilanciarlo sullo stesso file non aggiunge nulla**: la deduplica è della coda, non dello
 *   script (qui non c'è memo né stato, e non deve esserci);
 * - file assente, illeggibile o malformato: esce pulito e dice perché. Un errore qui sveglierebbe
 *   qualcuno per un file che non è ancora arrivato.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { createCodaEventi } = require('../src/cache/codaEventi');
const {
    FILE_NAME,
    percorsoDiffDefault,
    parseArgs,
    leggiArtefatto,
    pushDiffInCoda,
    main
} = require('../scripts/push-diff-in-coda');

/**
 * Redis finto in memoria: solo i comandi che la coda usa davvero.
 * Copia deliberata di quello di `tests/codaEventi.test.js` (i due file di test non si importano:
 * richiederne uno eseguirebbe anche i suoi test).
 */
function creaRedisFinto() {
    const liste = new Map();
    const hash = new Map();
    const _lista = (k) => { if (!liste.has(k)) liste.set(k, []); return liste.get(k); };
    const _hash = (k) => { if (!hash.has(k)) hash.set(k, new Map()); return hash.get(k); };

    return {
        async hsetnx(k, campo, valore) { const h = _hash(k); if (h.has(campo)) return 0; h.set(campo, String(valore)); return 1; },
        async hmget(k, ...campi) { const h = _hash(k); return campi.map((c) => (h.has(c) ? h.get(c) : null)); },
        async hexists(k, campo) { return _hash(k).has(campo) ? 1 : 0; },
        async hdel(k, campo) { return _hash(k).delete(campo) ? 1 : 0; },
        async hincrby(k, campo, incremento) { const h = _hash(k); const v = (Number(h.get(campo)) || 0) + incremento; h.set(campo, String(v)); return v; },
        async rpush(k, ...valori) { const l = _lista(k); l.push(...valori); return l.length; },
        async lrange(k, inizio, fine) { return _lista(k).slice(Math.max(0, inizio), fine + 1); },
        async lrem(k, _n, valore) { const l = _lista(k); let rimossi = 0; for (let i = l.length - 1; i >= 0; i--) { if (l[i] === valore) { l.splice(i, 1); rimossi++; } } return rimossi; },
        async expire() { return 1; }
    };
}

const ARTEFATTO = {
    schemaVersion: 1,
    generato: '2026-10-02T04:00:00.000Z',
    file: FILE_NAME,
    primoGiro: false,
    cap: 5000,
    oltreSoglia: false,
    cambiati: 3,
    diventatiDoppiati: 2,
    nonPiuDoppiati: 1,
    changes: [
        { tipo: 'movie', id: 5, badge: 'ITA' },      // è diventato doppiato: badge da mettere
        { tipo: 'tv', id: 1399, badge: 'ITA' },      // id numerico o stringa: stessa cosa in coda
        { tipo: 'movie', id: 7, badge: null }        // non è più doppiato: badge da togliere
    ]
};

describe('push del diff dei doppiaggi nella coda degli eventi', () => {
    let dir;
    let file;
    let redis;
    let coda;
    let log;

    const scriviArtefatto = (contenuto) => {
        fs.writeFileSync(file, typeof contenuto === 'string' ? contenuto : JSON.stringify(contenuto, null, 1), 'utf8');
        return file;
    };

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-diff-'));
        file = path.join(dir, FILE_NAME);
        redis = creaRedisFinto();
        coda = createCodaEventi(redis);
        log = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    });

    test('il percorso si prende da --file, dall\'ambiente o dal default', () => {
        expect(path.basename(parseArgs(['--file', 'qualche/cartella/x.json'], {}).filePath)).toBe('x.json');
        expect(path.basename(parseArgs([], { ITA_DIFF_PATH: '/data/tmdb/x.json' }).filePath)).toBe('x.json');
        expect(path.basename(percorsoDiffDefault({ TMDB_DUMP_DIR: '/data/tmdb' }))).toBe(FILE_NAME);
        expect(path.isAbsolute(parseArgs([], {}).filePath)).toBe(true); // mai relativo: gira da cron
        expect(parseArgs(['--dry-run']).dryRun).toBe(true);
        expect(() => parseArgs(['--file'])).toThrow(/richiede un percorso/);
    });

    test('un artefatto di 3 cambiamenti spinge 3 eventi, col badge giusto', async () => {
        scriviArtefatto(ARTEFATTO);

        const esito = await pushDiffInCoda({ filePath: file, coda, log });

        expect(esito.eventi).toBe(3);
        expect(esito.spinte).toBe(3);
        expect(esito.giaInCoda).toBe(0);

        const inCoda = await coda.take(10);
        expect(inCoda).toEqual([
            { tipo: 'movie', id: '5', badge: 'ITA' },
            { tipo: 'tv', id: '1399', badge: 'ITA' },
            { tipo: 'movie', id: '7', badge: null } // badge null = toglierlo, non "non so"
        ]);
    });

    test('rilanciato sullo stesso artefatto non aggiunge nulla (deduplica della coda)', async () => {
        scriviArtefatto(ARTEFATTO);

        const prima = await pushDiffInCoda({ filePath: file, coda, log });
        const seconda = await pushDiffInCoda({ filePath: file, coda, log });
        const terza = await pushDiffInCoda({ filePath: file, coda, log });

        expect(prima.spinte).toBe(3);
        expect(seconda.spinte).toBe(0);
        expect(seconda.giaInCoda).toBe(3);
        expect(terza.spinte).toBe(0);
        expect(await coda.take(10)).toHaveLength(3); // tre giri, tre eventi: non uno di più
    });

    test('movie:5 e tv:5 sono due eventi diversi (stesso id, tipo diverso)', async () => {
        scriviArtefatto({
            ...ARTEFATTO,
            cambiati: 2,
            changes: [
                { tipo: 'movie', id: 5, badge: 'ITA' },
                { tipo: 'tv', id: 5, badge: 'ITA' }
            ]
        });

        const esito = await pushDiffInCoda({ filePath: file, coda, log });

        expect(esito.spinte).toBe(2);
        expect((await coda.take(10)).map((e) => e.tipo)).toEqual(['movie', 'tv']);
    });

    test('file assente: esce pulito e dice perché', async () => {
        const esito = await pushDiffInCoda({ filePath: file, coda, log });

        expect(esito.spinte).toBe(0);
        expect(esito.motivo).toMatch(/file assente/);
        expect(log.log).toHaveBeenCalledWith(expect.stringContaining('nessun evento da spingere'));
        await expect(coda.take(10)).resolves.toEqual([]);
    });

    test('artefatto malformato: JSON rotto, oggetto senza changes, lista: esce pulito', async () => {
        const casi = [
            ['{ "changes": [ ', /JSON malformato/],
            ['[1, 2, 3]', /non contiene un oggetto JSON/],
            ['{ "cambiati": 2 }', /non ha una lista `changes`/]
        ];

        for (const [contenuto, motivo] of casi) {
            scriviArtefatto(contenuto);
            const esito = await pushDiffInCoda({ filePath: file, coda, log });

            expect(esito.spinte).toBe(0);
            expect(esito.motivo).toMatch(motivo);
        }
        await expect(coda.take(10)).resolves.toEqual([]);
    });

    test('un file illeggibile (una cartella) non è un errore', () => {
        const cartella = path.join(dir, 'una-cartella.diff.json');
        fs.mkdirSync(cartella);

        const lettura = leggiArtefatto(cartella);

        expect(lettura.ok).toBe(false);
        expect(lettura.motivo).toMatch(/illeggibile/);
    });

    test('cambi malformati dentro un artefatto valido: spinge i buoni e conta gli scarti', async () => {
        scriviArtefatto({
            ...ARTEFATTO,
            changes: [
                { tipo: 'movie', id: 5, badge: 'ITA' },
                { tipo: 'tv' },            // senza id
                { id: 99 },               // senza tipo
                null                      // riga spazzatura
            ]
        });

        const esito = await pushDiffInCoda({ filePath: file, coda, log });

        expect(esito.eventi).toBe(1);
        expect(esito.scartati).toBe(3);
        expect(esito.spinte).toBe(1);
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('3 cambi senza tipo/id'));
        expect(await coda.take(10)).toEqual([{ tipo: 'movie', id: '5', badge: 'ITA' }]);
    });

    test('artefatto di primo giro: nessun evento (per contratto)', async () => {
        scriviArtefatto({ ...ARTEFATTO, primoGiro: true, cambiati: 0, changes: [] });

        const esito = await pushDiffInCoda({ filePath: file, coda, log });

        expect(esito.primoGiro).toBe(true);
        expect(esito.spinte).toBe(0);
        expect(log.log).toHaveBeenCalledWith(expect.stringContaining('primo giro'));
    });

    test('dry-run: legge e conta, non accoda', async () => {
        scriviArtefatto(ARTEFATTO);

        const esito = await pushDiffInCoda({ filePath: file, coda, log, dryRun: true });

        expect(esito.eventi).toBe(3);
        expect(esito.spinte).toBe(0);
        await expect(coda.take(10)).resolves.toEqual([]);
    });

    test('oltre il tetto dei 5.000: avvisa e spinge lo stesso (il numero vero è nell\'artefatto)', async () => {
        scriviArtefatto({ ...ARTEFATTO, oltreSoglia: true, cambiati: 9000, avviso: 'ATTENZIONE: ...' });

        const esito = await pushDiffInCoda({ filePath: file, coda, log });

        expect(esito.spinte).toBe(3);
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('oltre il tetto'));
    });

    test('una coda che non risponde non fa fallire lo script (il timer deve proseguire)', async () => {
        scriviArtefatto(ARTEFATTO);
        const codaMorta = createCodaEventi(new Proxy({}, { get: () => async () => { throw new Error('Redis giù'); } }));
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        const esito = await pushDiffInCoda({ filePath: file, coda: codaMorta, log });

        expect(esito.spinte).toBe(0);
        expect(esito.giaInCoda).toBe(3);
        console.warn.mockRestore();
    });

    test('main() esce con 0 anche quando il file non c\'è (è una condizione attesa)', async () => {
        const suono = jest.spyOn(console, 'log').mockImplementation(() => {});
        const rumore = jest.spyOn(console, 'error').mockImplementation(() => {});

        await expect(main(['--file', file], {})).resolves.toBe(0);
        await expect(main(['--help'], {})).resolves.toBe(0);
        await expect(main(['--file'], {})).resolves.toBe(1); // argomento sbagliato: questo è un errore vero

        suono.mockRestore();
        rumore.mockRestore();
    });
});
