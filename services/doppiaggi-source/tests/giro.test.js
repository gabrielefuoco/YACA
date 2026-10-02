/**
 * giro.test.js
 * Il diff agganciato al giro: il pezzo che mancava fra `diff.js` (che sa il confronto) e
 * `writer.js` (che sa scrivere). Tutto offline, su una cartella temporanea.
 *
 * I tre fatti che il test stringe, nell'ordine in cui possonorompere:
 *  - il diff si calcola **prima** della riscrittura (è l'unico momento in cui su disco c'è ancora il
 *    giro precedente): due giri con contenuti diversi producono l'artefatto del secondo;
 *  - la guardia bloccando non produce **nessun** evento e non tocca l'artefatto: su disco il file
 *    delle annotazioni è ancora quello vecchio, quindi nessun doppiaggio è cambiato;
 *  - un diff che esplode non ferma il giro: le annotazioni vengono scritte lo stesso.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scriviConDiff } = require('../src/giro');
const { metaPathFor } = require('../src/writer');
const { diffPathFor } = require('../src/diff');

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'doppiaggi-giro-'));
}

/** Logger finto: tace e si lascia interrogare (i test non sporcano l'output). */
function logFinto() {
    const voci = [];
    return {
        voci,
        log: (...a) => voci.push({ livello: 'log', testo: a.join(' ') }),
        warn: (...a) => voci.push({ livello: 'warn', testo: a.join(' ') }),
        error: (...a) => voci.push({ livello: 'error', testo: a.join(' ') })
    };
}

const riga = (t, id, ita) => ({ t, id, ita });

/** `n` righe doppiate e ferme: la guardia del writer (-2% sui `true`) è un rumolo di fondo
 *  nei test che non la stanno provando, e con due o tre righe scatterebbe a ogni giro. */
const ferme = (n, da = 1000, t = 'movie') => Array.from({ length: n }, (_, i) => riga(t, da + i, true));

test('giro - primo giro: scrive il file e un artefatto vuoto (nessun evento)', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    const log = logFinto();

    const esito = await scriviConDiff([riga('movie', 5, true), riga('tv', 9, null)], { outputPath: out, log });

    assert.equal(esito.written, true);
    assert.equal(esito.diff.primoGiro, true, 'senza file precedente non si può confrontare: nessun evento');
    assert.equal(esito.diff.cambiati, 0);
    assert.equal(fs.readFileSync(out, 'utf8'), [
        JSON.stringify(riga('movie', 5, true)),
        JSON.stringify(riga('tv', 9, null))
    ].join('\n') + '\n');
    // L'artefatto esiste comunque: "questo giro non ha prodotto eventi" è un'informazione.
    assert.equal(fs.existsSync(diffPathFor(out)), true);
});

test('giro - il diff è calcolato PRIMA della scrittura: due giri diversi producono il diff', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    const log = logFinto();

    const primo = await scriviConDiff([
        riga('movie', 5, true),   // diventa doppiato nel giro dopo
        riga('movie', 7, true),   // smette di esserlo nel giro dopo
        riga('tv', 100, true)     // invariato: nessun evento
    ], { outputPath: out, log });
    assert.equal(primo.diff.cambiati, 0);

    const secondo = await scriviConDiff([
        riga('movie', 5, true),
        riga('movie', 7, null),
        riga('tv', 100, true),
        riga('tv', 200, true)     // nuovo doppiato
    ], { outputPath: out, log });

    assert.equal(secondo.written, true);
    assert.deepEqual(secondo.diff.changes.map((c) => `${c.tipo}:${c.id}:${c.badge}`), [
        'movie:7:null',   // il badge va tolto
        'tv:200:ITA'      // il badge va messo
    ]);

    // Se il diff fosse stato calcolato dopo la riscrittura, il confronto sarebbe stato col file
    // già nuovo: zero cambiamenti. L'artefatto è la prova che il momento è quello giusto.
    const artefatto = JSON.parse(fs.readFileSync(diffPathFor(out), 'utf8'));
    assert.equal(artefatto.primoGiro, false);
    assert.equal(artefatto.cambiati, 2);
    assert.equal(artefatto.diventatiDoppiati, 1);
    assert.equal(artefatto.nonPiuDoppiati, 1);
});

test('giro - nel log del giro c\'è il numero di cambi', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    const log = logFinto();

    // Il secondo giro toglie il badge a `movie:5`: le altre righe restano ferme, quindi la guardia
    // del writer non scatta e il giro scrive davvero.
    await scriviConDiff([riga('movie', 5, true), ...ferme(100)], { outputPath: out, log });
    await scriviConDiff([riga('movie', 5, null), ...ferme(100)], { outputPath: out, log });

    const righeDiff = log.voci.filter((v) => v.testo.startsWith('[Diff]') && v.testo.includes('cambi di doppiaggio'));
    const ultimoGiro = righeDiff[righeDiff.length - 1];
    assert.match(ultimoGiro.testo, /\[Diff\] 1 cambi di doppiaggio/);
    assert.match(ultimoGiro.testo, /non più doppiati: 1/);
});

test('giro - la guardia bloccata non produce eventi e non tocca l\'artefatto', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    const log = logFinto();

    const molte = [];
    for (let i = 1; i <= 20; i++) molte.push(riga('movie', i, true));
    const primo = await scriviConDiff(molte, { outputPath: out, log });
    assert.equal(primo.written, true);

    const filePrima = fs.readFileSync(out, 'utf8');
    const artefattoPrima = fs.readFileSync(diffPathFor(out), 'utf8');

    // Giro con un crollo dei doppiati: il writer lo blocca (sotto il -2%).
    const poche = [riga('movie', 1, true)];
    const secondo = await scriviConDiff(poche, { outputPath: out, log });

    assert.equal(secondo.written, false);
    assert.equal(secondo.reason, 'guard');
    assert.equal(secondo.diff, null, 'un giro che non ha scritto non genera eventi');

    // Il file delle annotazioni è quello vecchio: nessun doppiaggio è cambiato.
    assert.equal(fs.readFileSync(out, 'utf8'), filePrima);
    assert.equal(JSON.parse(fs.readFileSync(metaPathFor(out), 'utf8')).counts.true, 20);
    // E l'artefatto è ancora quello dell'ultimo giro **scritto**: non viene inventato un diff
    // per un giro che non è esistito.
    assert.equal(fs.readFileSync(diffPathFor(out), 'utf8'), artefattoPrima);

    const avviso = log.voci.find((v) => v.livello === 'error' && v.testo.includes('guardia'));
    assert.ok(avviso, 'il blocco della guardia è detto ad alta voce');
});

test('giro - un diff che esplode non ferma il giro: le annotazioni vengono scritte lo stesso', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    const log = logFinto();

    await scriviConDiff([riga('movie', 5, true)], { outputPath: out, log });

    const righe = [riga('movie', 5, true), riga('tv', 100, null)];
    const esito = await scriviConDiff(righe, {
        outputPath: out,
        log,
        // Il caso reale: file precedente illeggibile, righe rotte, disco pieno.
        calcolaDiff: async () => { throw new Error('EACCES: file precedente illeggibile'); }
    });

    assert.equal(esito.written, true, 'il giro deve completare la scrittura comunque');
    assert.equal(esito.counts.rows, 2);
    assert.equal(esito.diff, null);
    assert.equal(fs.readFileSync(out, 'utf8'), righe.map((r) => JSON.stringify(r)).join('\n') + '\n');

    const avviso = log.voci.find((v) => v.livello === 'warn' && v.testo.includes('calcolo fallito'));
    assert.ok(avviso, 'il diff rotto è loggato');
    assert.match(avviso.testo, /EACCES/);
});

test('giro - righe disordinate in ingresso: il diff le ordina prima (l\'ordinamento non è un dettaglio)', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    const log = logFinto();

    const fisse = ferme(100, 5000, 'tv');
    await scriviConDiff([riga('tv', 100, true), riga('movie', 5, true), ...fisse], { outputPath: out, log });

    // Due titoli perdono il badge, i fermi tengono il loro `true`: la guardia non c'entra,
    // l'ordine con cui le righe arrivano sì.
    const esito = await scriviConDiff(
        [riga('tv', 100, null), riga('movie', 5, null), ...fisse],
        { outputPath: out, log }
    );

    assert.equal(esito.written, true);
    assert.equal(esito.diff.cambiati, 2);
    assert.equal(fs.readFileSync(out, 'utf8'), [
        JSON.stringify(riga('movie', 5, null)),
        JSON.stringify(riga('tv', 100, null)),
        ...fisse.map((r) => JSON.stringify(r))
    ].join('\n') + '\n', 'il file resta ordinato per (tipo, id)');
});

test('giro - dry-run: non scrive niente e non calcola nessun diff', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    const log = logFinto();

    const esito = await scriviConDiff([riga('movie', 5, true)], { outputPath: out, dryRun: true, log });

    assert.equal(esito.written, false);
    assert.equal(esito.reason, 'dry-run');
    assert.equal(esito.diff, null);
    assert.equal(fs.existsSync(out), false);
    assert.equal(fs.existsSync(diffPathFor(out)), false);
});
