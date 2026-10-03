/**
 * Single-flight di `itaAnnotations.getSnapshot()`: una lettura sola per raffica.
 *
 * Il difetto: senza coalescing, N chiamate a TTL scaduto leggevano N volte lo stesso file
 * (misurato: 20 letture di 24.119 righe, ~430 ms). Il pattern è quello già in casa di
 * `CacheManager.activePromises`.
 *
 * Offline: il file è una fixture temporanea, le letture si contano spiando `fs.createReadStream`,
 * che è la funzione che `readFile()` usa davvero per aprire il file.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const itaAnnotations = require('../src/data/itaAnnotations');

const VALIDO = '{"t":"movie","id":5,"ita":true}\n{"t":"tv","id":1399,"ita":null}\n';

let file;
let letture;      // quante volte è stato aperto il file
let fallire;      // accende l'errore di lettura
let t0;

beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ita-sf-'));
    file = path.join(dir, 'ita_annotations.jsonl');
    fs.writeFileSync(file, VALIDO, 'utf8');
    process.env.ITA_ANNOTATIONS_PATH = file;
    itaAnnotations.reset();

    letture = 0;
    fallire = false;
    const apriFile = fs.createReadStream; // la funzione vera, prima dello spy
    jest.spyOn(fs, 'createReadStream').mockImplementation(function (...args) {
        letture++;
        if (fallire) throw new Error('EACCES simulato');
        return apriFile.apply(fs, args);
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // `Date.now` pilotato: il TTL di 60 s scade senza far passare un minuto di test.
    t0 = 1700000000000;
    jest.spyOn(Date, 'now').mockImplementation(() => t0);
});

afterEach(() => {
    delete process.env.ITA_ANNOTATIONS_PATH;
    jest.restoreAllMocks();
    itaAnnotations.reset();
});

/** Porta il clock oltre il TTL, così la prossima `getSnapshot()` rilegge. */
function scadiTtl() {
    t0 += itaAnnotations.CACHE_TTL_MS + 1;
}

describe('itaAnnotations - single-flight', () => {
    test('20 chiamate concorrenti a TTL scaduto: una sola lettura del file', async () => {
        await itaAnnotations.getSnapshot();
        expect(letture).toBe(1);

        scadiTtl();
        const snapshots = await Promise.all(
            Array.from({ length: 20 }, () => itaAnnotations.getSnapshot())
        );

        expect(letture).toBe(2); // 1 iniziale + 1 sola per tutta la raffica
        // Non venti risultati equivalenti: lo stesso oggetto, quello appena letto.
        expect(snapshots.every((s) => s === snapshots[0])).toBe(true);
        expect(itaAnnotations.isDubbed(snapshots[0], 'movie', 5)).toBe(true);
        expect(snapshots[0].count).toBe(2);
    });

    test('una lettura fallita non viene ricordata: la chiamata dopo ritenta e riesce', async () => {
        fallire = true;
        const fallito = await itaAnnotations.getSnapshot();
        expect(fallito.error).toBe('EACCES simulato');
        expect(fallito.count).toBe(0);
        expect(letture).toBe(1);

        // Il file è a posto e NON è passato un secondo: se l'errore fosse in cache, la chiamata
        // dopo restituirebbe ancora lo snapshot vuoto senza rileggere.
        fallire = false;
        const guarito = await itaAnnotations.getSnapshot();

        expect(letture).toBe(2); // ha ritentato
        expect(guarito.error).toBeNull();
        expect(itaAnnotations.isDubbed(guarito, 'movie', 5)).toBe(true);
    });

    test('lettura fallita: la raffica la condivide, e dopo il chiamante successivo riprova', async () => {
        fallire = true;
        const [a, b, c] = await Promise.all([
            itaAnnotations.getSnapshot(),
            itaAnnotations.getSnapshot(),
            itaAnnotations.getSnapshot()
        ]);
        expect(letture).toBe(1); // una sola lettura fallita per tutti e tre
        expect(a.error).toBe('EACCES simulato');
        expect(b).toBe(a);
        expect(c).toBe(a);

        fallire = false;
        const dopo = await itaAnnotations.getSnapshot();
        expect(letture).toBe(2);
        expect(dopo.error).toBeNull();
        expect(dopo.count).toBe(2);
    });

    test('il TTL continua a funzionare: dopo la scadenza si rilegge una volta sola', async () => {
        const primo = await itaAnnotations.getSnapshot();
        expect(letture).toBe(1);

        // Dentro il TTL: nessuna lettura.
        await itaAnnotations.getSnapshot();
        await itaAnnotations.getSnapshot();
        expect(letture).toBe(1);

        scadiTtl();
        const dopo = await itaAnnotations.getSnapshot();
        expect(letture).toBe(2);
        expect(dopo).not.toBe(primo);

        fs.writeFileSync(file, '{"t":"movie","id":5,"ita":null}\n', 'utf8');
        scadiTtl();
        const riletto = await itaAnnotations.getSnapshot();
        expect(letture).toBe(3);
        expect(itaAnnotations.getStatus(riletto, 'movie', 5)).toBe(null);
    });

    test('il caso normale: 50 chiamate in sequenza dentro il TTL, una lettura', async () => {
        for (let i = 0; i < 50; i++) {
            const snap = await itaAnnotations.getSnapshot();
            expect(itaAnnotations.isDubbed(snap, 'movie', 5)).toBe(true);
        }
        expect(letture).toBe(1);
    });

    test('force durante una lettura in volo: si aggancia, non riluce', async () => {
        const inFlight = itaAnnotations.getSnapshot(); // parte la lettura
        const forzato = itaAnnotations.getSnapshot({ force: true }); // si aggancia in volo
        const snaps = await Promise.all([inFlight, forzato]);

        expect(letture).toBe(1);
        expect(snaps[0]).toBe(snaps[1]);

        // Il force successivo, senza letture in volo, riluce come prima.
        await itaAnnotations.getSnapshot({ force: true });
        expect(letture).toBe(2);
    });
});