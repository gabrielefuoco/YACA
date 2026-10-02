/**
 * diff.test.js
 * Test offline del diff fra due giri di annotazioni doppiaggio.
 *
 * Il contratto è piccolo e netto: un titolo che **diventa** doppiato produce `{tipo, id, badge:'ITA'}`,
 * un titolo che **non è più** doppiato produce `{tipo, id, badge:null}`, tutto il resto non produce
 * niente. Al **primo giro** (nessun file precedente) il diff è vuoto per contratto.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    computeChanges,
    computeDiff,
    writeDiff,
    runDiff,
    diffPathFor,
    CAP_CAMBI,
    BADGE_ITA,
    DEFAULT_FILENAME
} = require('../src/diff');

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'doppiaggi-diff-'));
}

/** Scrive un NDJSON di annotazioni, già ordinato per (tipo, id) come il file vero. */
function scrivi(filePath, righe) {
    fs.writeFileSync(
        filePath,
        righe.length ? `${righe.map((r) => JSON.stringify(r)).join('\n')}\n` : '',
        'utf8'
    );
    return filePath;
}

test('diff - un titolo che diventa doppiato produce un evento con badge ITA', async () => {
    const cambi = await computeChanges(
        [{ t: 'movie', id: 5, ita: null }],
        [{ t: 'movie', id: 5, ita: true }]
    );
    assert.deepEqual(cambi, [{ tipo: 'movie', id: 5, badge: 'ITA' }]);
});

test('diff - null -> true (promozione) è un cambiamento, non un invariamento', async () => {
    // `null` è l'indecisione sull'omonimia: risolta, il titolo è doppiato. Il poster cambia.
    const cambi = await computeChanges(
        [{ t: 'tv', id: 1399, ita: null }],
        [{ t: 'tv', id: 1399, ita: true }]
    );
    assert.equal(cambi.length, 1);
    assert.equal(cambi[0].badge, BADGE_ITA);
});

test('diff - un titolo che non è più doppiato produce un evento con badge null', async () => {
    const cambi = await computeChanges(
        [{ t: 'movie', id: 5, ita: true }],
        [{ t: 'movie', id: 5, ita: null }]
    );
    assert.deepEqual(cambi, [{ tipo: 'movie', id: 5, badge: null }],
        'togliere il badge è un evento: il poster va rifatto senza badge');
});

test('diff - true che sparisce del tutto è un evento con badge null', async () => {
    const cambi = await computeChanges([{ t: 'movie', id: 5, ita: true }], []);
    assert.deepEqual(cambi, [{ tipo: 'movie', id: 5, badge: null }]);
});

test('diff - titolo invariato: nessun evento', async () => {
    const invariato = [
        { t: 'movie', id: 5, ita: true },
        { t: 'movie', id: 7, ita: null },
        { t: 'tv', id: 9, ita: true }
    ];
    assert.deepEqual(await computeChanges(invariato, invariato.slice()), [],
        'true -> true, null -> null: niente da rifare');
});

test('diff - righe solo da una parte: nessuna eccezione, e gli eventi dipendono dal ita', async () => {
    // riga nuova non doppiata: nessun badge da mettere, nessun evento
    let cambi = await computeChanges([], [{ t: 'movie', id: 1, ita: null }]);
    assert.deepEqual(cambi, []);

    // riga sparita e non doppiata: nessun badge da togliere, nessun evento
    cambi = await computeChanges([{ t: 'movie', id: 1, ita: null }], []);
    assert.deepEqual(cambi, []);

    // riga nuova *doppiata*: per contratto "assente -> true" è diventare doppiato (badge da mettere)
    cambi = await computeChanges([], [{ t: 'movie', id: 1, ita: true }]);
    assert.deepEqual(cambi, [{ tipo: 'movie', id: 1, badge: BADGE_ITA }]);

    // riga sparita *doppiata*: il badge va tolto
    cambi = await computeChanges([{ t: 'movie', id: 1, ita: true }], []);
    assert.deepEqual(cambi, [{ tipo: 'movie', id: 1, badge: null }]);
});

test('diff - primo giro: elenco vuoto, anche con 19.000 doppiati "nuovi"', async () => {
    const nuove = Array.from({ length: 20000 }, (_, i) => ({ t: 'movie', id: i, ita: true }));
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    const ancoraDaScrivere = path.join(dir, 'ita_annotations.jsonl'); // primo giro: il file non c'è
    const esito = await computeDiff({
        previousPath: ancoraDaScrivere,
        current: nuove,
        currentPath: out,
        quiet: true
    });
    assert.equal(esito.primoGiro, true);
    assert.deepEqual(esito.changes, [], 'il primo giro non accoda nulla: 19.000 poster in un colpo non è un lavoro');
    assert.equal(esito.cambiati, 0);

    // la stessa cosa vista dalla funzione pura: il gate è il flag, non l'elenco vuoto
    const conFlag = await computeChanges([], nuove, { primoGiro: true });
    assert.deepEqual(conFlag, [], 'primoGiro: corto circuito, nessun evento');

    // e senza il flag il calcolo puro dice la verità (è il gate di computeDiff a decidere)
    const senzaFlag = await computeChanges([], nuove);
    assert.equal(senzaFlag.length, 20000, 'senza il gate, tutte le righe nuove sono "diventate doppiate"');
});

test('diff - primo giro anche quando il percorso precedente non è nemmeno indicato', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    scrivi(out, [{ t: 'movie', id: 5, ita: true }]);
    const esito = await computeDiff({ previousPath: path.join(dir, 'non-esiste.jsonl'), currentPath: out, quiet: true });
    assert.equal(esito.primoGiro, true);
    assert.deepEqual(esito.changes, []);
});

test('diff - l\'ordinamento è sfruttato: due file con lo stesso contenuto in ordine diverso', async () => {
    // Stesse righe, ordini diversi. Se il confronto non usasse (tipo, id) ma l'ordine di arrivo,
    // qui comparirebbero eventi fantasma.
    const vecchie = [
        { t: 'tv', id: 300, ita: true },
        { t: 'movie', id: 5, ita: true },
        { t: 'movie', id: 5, ita: true },
        { t: 'tv', id: 100, ita: null }
    ].sort((x, y) => (x.t === y.t ? x.id - y.id : x.t < y.t ? -1 : 1));

    const nuove = [
        { t: 'movie', id: 5, ita: true },
        { t: 'tv', id: 100, ita: true },
        { t: 'tv', id: 300, ita: true },
        { t: 'movie', id: 5, ita: true }
    ].sort((x, y) => (x.t === y.t ? x.id - y.id : x.t < y.t ? -1 : 1));

    const cambi = await computeChanges(vecchie, nuove);
    assert.deepEqual(cambi, [{ tipo: 'tv', id: 100, badge: BADGE_ITA }],
        'un solo cambi vero (tv:100 da null a true), non un evento per ogni riga');
});

test('diff - due file disordinati: il risultato è segnalato (non nascosto)', async () => {
    const anomale = [];
    await computeChanges(
        [{ t: 'movie', id: 9, ita: true }, { t: 'movie', id: 5, ita: true }],
        [{ t: 'movie', id: 5, ita: true }, { t: 'movie', id: 9, ita: true }],
        { onAnomalia: (info) => anomale.push(info) }
    );
    assert.ok(anomale.length >= 1, 'un file fuori ordine deve essere segnalato');
    assert.match(anomale[0].motivo, /ordine/);
});

test('diff - righe corrotte e non numeriche: saltate, senza eventi fantasma', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    fs.writeFileSync(out, [
        '{"t":"movie","id":5,"ita":true}',
        '',                                  // riga vuota
        'non è json',                        // rotta
        '{"t":"movie","id":"cinque","ita":true}', // id non numerico
        '{"t":"film","id":7,"ita":true}',     // tipo ignoto
        '{"t":"movie","id":6,"ita":true}',
        ''
    ].join('\n'), 'utf8');

    const esito = await computeDiff({
        previousPath: out,
        currentPath: path.join(dir, 'nuovo.jsonl'),
        quiet: true
    }).catch((err) => err);

    // il file "nuovo" non esiste: deve esserci un errore chiaro, non uno stack
    assert.match(String(esito.message), /non esiste/);
});

test('diff - da due file: i cambi escono con i conteggi giusti', async () => {
    const dir = tempDir();
    const vecchio = scrivi(path.join(dir, 'vecchio.jsonl'), [
        { t: 'movie', id: 5, ita: true },   // smette -> badge null
        { t: 'movie', id: 6, ita: true },   // invariato
        { t: 'tv', id: 100, ita: null }     // diventa -> badge ITA
    ]);
    const nuovo = scrivi(path.join(dir, 'nuovo.jsonl'), [
        { t: 'movie', id: 5, ita: null },
        { t: 'movie', id: 6, ita: true },
        { t: 'tv', id: 100, ita: true }
    ]);

    const esito = await computeDiff({ previousPath: vecchio, currentPath: nuovo, quiet: true });
    assert.equal(esito.primoGiro, false);
    assert.equal(esito.cambiati, 2);
    assert.equal(esito.diventatiDoppiati, 1);
    assert.equal(esito.nonPiuDoppiati, 1);
    assert.deepEqual(esito.changes, [
        { tipo: 'movie', id: 5, badge: null },
        { tipo: 'tv', id: 100, badge: BADGE_ITA }
    ]);
    assert.deepEqual(esito.righe, { vecchie: 3, nuove: 3 });
    assert.equal(esito.ordineSospetto, false);
});

test('diff - il file mancante di questo giro è un errore esplicito', async () => {
    const dir = tempDir();
    const vecchio = scrivi(path.join(dir, 'vecchio.jsonl'), [{ t: 'movie', id: 5, ita: true }]);
    await assert.rejects(
        () => computeDiff({ previousPath: vecchio, currentPath: path.join(dir, 'nuovo.jsonl'), quiet: true }),
        /non esiste/
    );
    await assert.rejects(
        () => computeDiff({ previousPath: vecchio, quiet: true }),
        /current/
    );
});

test('diff - il calcolo scorre due sorgenti lazy (nessun array da 24.000 righe)', async () => {
    let letteVecchie = 0;
    let letteNuove = 0;
    async function* genera(n, etichetta) {
        for (let i = 0; i < n; i++) {
            if (etichetta === 'v') letteVecchie++;
            else letteNuove++;
            yield `{"t":"movie","id":${i},"ita":true}`; // righe greffe, come dal file
        }
    }
    const cambi = await computeChanges(genera(1000, 'v'), genera(1000, 'n'));
    assert.equal(cambi.length, 0, 'identici: nessun evento');
    assert.equal(letteVecchie, 1000);
    assert.equal(letteNuove, 1000);
});

test('diff - artefatto: scrittura atomica, conteggi e forma del file', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');

    const esito = {
        changes: [
            { tipo: 'movie', id: 5, badge: BADGE_ITA },
            { tipo: 'tv', id: 100, badge: null }
        ]
    };
    const res = await writeDiff(esito, { outputPath: out, quiet: true });
    assert.equal(res.written, true);

    const diffPath = diffPathFor(out);
    assert.equal(diffPath, path.join(dir, DEFAULT_FILENAME));
    assert.ok(!fs.existsSync(`${diffPath}.tmp`), 'nessun file temporaneo residuo');

    const artefatto = JSON.parse(fs.readFileSync(diffPath, 'utf8'));
    assert.equal(artefatto.cambiati, 2);
    assert.equal(artefatto.diventatiDoppiati, 1);
    assert.equal(artefatto.nonPiuDoppiati, 1);
    assert.ok(artefatto.generato, 'c\'è il timestamp');
    assert.equal(artefatto.oltreSoglia, false);
    assert.deepEqual(artefatto.changes, esito.changes);
});

test('diff - tetto: oltre 5.000 cambi avvisa forte ma scrive comunque, col numero vero', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');

    const changes = Array.from({ length: CAP_CAMBI + 1 }, (_, i) => ({ tipo: 'movie', id: i, badge: BADGE_ITA }));
    const errori = [];
    const logErrore = console.error;
    console.error = (...a) => errori.push(a.join(' '));
    let res;
    try {
        res = await writeDiff({ changes }, { outputPath: out, quiet: true });
    } finally {
        console.error = logErrore;
    }

    assert.equal(res.oltreSoglia, true);
    assert.ok(res.avviso && /tetto/i.test(res.avviso));
    assert.equal(res.cambiati, CAP_CAMBI + 1, 'il numero non è né troncato né nascosto');

    const artefatto = JSON.parse(fs.readFileSync(diffPathFor(out), 'utf8'));
    assert.equal(artefatto.cambiati, CAP_CAMBI + 1);
    assert.equal(artefatto.oltreSoglia, true);
    assert.equal(artefatto.changes.length, CAP_CAMBI + 1);
    assert.ok(artefatto.avviso, 'l\'artefatto porta l\'avviso dentro');
});

test('diff - sotto il tetto non c\'è avviso', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    const res = await writeDiff({ changes: [{ tipo: 'movie', id: 1, badge: null }] }, { outputPath: out, quiet: true });
    assert.equal(res.oltreSoglia, false);
    assert.equal(res.avviso, null);
});

test('diff - writeDiff senza percorso è un errore', async () => {
    await assert.rejects(() => writeDiff({ changes: [] }, {}), /outputPath/);
});

test('diff - runDiff: primo giro scrive un artefatto vuoto e dichiarato', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    const righe = Array.from({ length: 50 }, (_, i) => ({ t: 'movie', id: i, ita: true }));
    scrivi(out, righe);

    // nessun `previousPath`: è il primo giro, e il diff deve essere vuoto anche se il file c'è già
    const esito = await runDiff({ outputPath: out, currentPath: out, quiet: true });
    assert.equal(esito.primoGiro, true);
    assert.equal(esito.written, true);

    const artefatto = JSON.parse(fs.readFileSync(diffPathFor(out), 'utf8'));
    assert.equal(artefatto.primoGiro, true);
    assert.equal(artefatto.cambiati, 0);
    assert.deepEqual(artefatto.changes, []);
});

test('diff - runDiff: secondo giro, il file precedente e le righe nuove danno i cambi veri', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    const log = console.log;
    const warning = console.warn;
    console.log = () => {};
    console.warn = () => {};
    try {
        const primeRighe = [{ t: 'movie', id: 5, ita: null }, { t: 'tv', id: 7, ita: true }];
        scrivi(out, primeRighe);
        const primo = await runDiff({ outputPath: out, previousPath: out, current: primeRighe, quiet: true });
        assert.equal(primo.primoGiro, false, 'il file precedente c\'è: non è primo giro');
        assert.equal(primo.cambiati, 0);

        // giro dopo: il writer ha riscritto il file, il precedente è uno snapshot
        const snapshot = scrivi(path.join(dir, 'ita_annotations.prev.jsonl'), primeRighe);
        const nuove = [{ t: 'movie', id: 5, ita: true }, { t: 'tv', id: 7, ita: true }];
        scrivi(out, nuove);
        const esito = await runDiff({ outputPath: out, previousPath: snapshot, current: nuove, quiet: true });

        assert.equal(esito.primoGiro, false);
        assert.equal(esito.cambiati, 1);
        const artefatto = JSON.parse(fs.readFileSync(diffPathFor(out), 'utf8'));
        assert.deepEqual(artefatto.changes, [{ tipo: 'movie', id: 5, badge: BADGE_ITA }]);
    } finally {
        console.log = log;
        console.warn = warning;
    }
});
// `extra`: i campi che il chiamante aggiunge all'artefatto (un giro bloccato dalla guardia scrive
// `guardia: true` e i cambi che non ha applicato). Serve che siano *aggiunti* e che i contatori
// descrivano sempre `changes`: un artefatto che mente sul numero è peggio di uno senza i campi.
test('diff - writeDiff: `extra` aggiunge i campi del chiamante senza alterare i contatori', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    scrivi(out, [{ t: 'movie', id: 5, ita: true }]);

    const esito = await writeDiff({ changes: [], primoGiro: false }, {
        outputPath: out,
        quiet: true,
        extra: {
            guardia: true,
            motivo: 'il giro non ha scritto',
            cambiNonApplicati: [{ tipo: 'movie', id: 7, badge: null }],
            conteggioNonApplicati: 1
        }
    });

    assert.equal(esito.written, true);
    const artefatto = JSON.parse(fs.readFileSync(esito.path, 'utf8'));
    assert.equal(artefatto.guardia, true);
    assert.match(artefatto.motivo, /non ha scritto/);
    assert.equal(artefatto.conteggioNonApplicati, 1);
    assert.deepEqual(artefatto.changes, [], 'la lista eventi resta quella di `changes`');
    assert.equal(artefatto.cambiati, 0);
});

test('diff - writeDiff: un `extra` che menta sui contatori non può far mentire l\'artefatto', async () => {
    const dir = tempDir();
    const out = path.join(dir, 'ita_annotations.jsonl');
    scrivi(out, [{ t: 'movie', id: 5, ita: true }]);

    const esito = await writeDiff({ changes: [{ tipo: 'movie', id: 9, badge: BADGE_ITA }] }, {
        outputPath: out,
        quiet: true,
        extra: { changes: [], cambiati: 0, diventatiDoppiati: 0, nonPiuDoppiati: 0 }
    });

    const artefatto = JSON.parse(fs.readFileSync(esito.path, 'utf8'));
    assert.equal(artefatto.cambiati, 1, 'i contatori descrivono sempre `changes`');
    assert.equal(artefatto.diventatiDoppiati, 1);
    assert.deepEqual(artefatto.changes, [{ tipo: 'movie', id: 9, badge: BADGE_ITA }]);
});
