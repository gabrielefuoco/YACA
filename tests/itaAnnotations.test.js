/**
 * Test del lettore delle annotazioni ITA (contratto del ticket 04:
 * chiave (tipo, id), `true` doppiato, `null` indecisione, assenza di riga = false).
 * Offline: il file è una fixture temporanea, il percorso arriva da ITA_ANNOTATIONS_PATH.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const itaAnnotations = require('../src/data/itaAnnotations');

function withFile(content) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppiaggi-ita-'));
    const file = path.join(dir, 'ita_annotations.jsonl');
    if (content !== null) fs.writeFileSync(file, content, 'utf8');
    process.env.ITA_ANNOTATIONS_PATH = file;
    itaAnnotations.reset();
    return file;
}

test.afterEach(() => {
    delete process.env.ITA_ANNOTATIONS_PATH;
    itaAnnotations.reset();
});

test('itaAnnotations - i tre stati: true, null, e riga assente = false', async () => {
    withFile(
        '{"t":"movie","id":5,"ita":true}\n' +
        '{"t":"tv","id":1399,"ita":null}\n'
    );
    const snap = await itaAnnotations.getSnapshot({ force: true });

    assert.equal(itaAnnotations.getStatus(snap, 'movie', 5), true);
    assert.equal(itaAnnotations.getStatus(snap, 'tv', 1399), null);
    assert.equal(itaAnnotations.getStatus(snap, 'movie', 999), false, 'riga assente = nessuna traccia');
    assert.equal(itaAnnotations.isDubbed(snap, 'movie', 5), true);
    assert.equal(itaAnnotations.isDubbed(snap, 'tv', 1399), false, 'null non produce badge');
    assert.equal(itaAnnotations.isDubbed(snap, 'movie', 999), false);
    assert.equal(snap.count, 2);
    assert.equal(snap.trueCount, 1);
    assert.equal(snap.nullCount, 1);
});

test('itaAnnotations - il tipo fa parte della chiave (5920 è due opere diverse)', async () => {
    withFile('{"t":"movie","id":5920,"ita":true}\n');
    const snap = await itaAnnotations.getSnapshot({ force: true });

    assert.equal(itaAnnotations.getStatus(snap, 'movie', 5920), true);
    assert.equal(itaAnnotations.getStatus(snap, 'tv', 5920), false, 'film e serie non si confondono');
});

test('itaAnnotations - id stringa e numero danno la stessa chiave', async () => {
    withFile('{"t":"tv","id":"1399","ita":true}\n');
    const snap = await itaAnnotations.getSnapshot({ force: true });
    assert.equal(itaAnnotations.isDubbed(snap, 'tv', 1399), true);
    assert.equal(itaAnnotations.isDubbed(snap, 'tv', '1399'), true);
});

test('itaAnnotations - file assente: snapshot vuoto, nessuna eccezione, nessun badge', async () => {
    withFile(null); // non lo creiamo
    const snap = await itaAnnotations.getSnapshot({ force: true });

    assert.equal(snap.count, 0);
    assert.ok(snap.error, 'lo snapshot dichiara il motivo');
    assert.equal(itaAnnotations.isDubbed(snap, 'movie', 5), false);
});

test('itaAnnotations - riga corrotta ignorata, il resto del file resta valido', async () => {
    withFile(
        '{"t":"movie","id":5,"ita":true}\n' +
        '{questo non è json}\n' +
        '{"t":"boh","id":7,"ita":true}\n' +
        '{"t":"tv","id":9,"ita":"forse"}\n' +
        '{"t":"tv","id":11,"ita":true}\n'
    );
    const snap = await itaAnnotations.getSnapshot({ force: true });

    assert.equal(snap.count, 2, 'solo le righe valide entrano');
    assert.equal(itaAnnotations.isDubbed(snap, 'movie', 5), true);
    assert.equal(itaAnnotations.isDubbed(snap, 'tv', 11), true);
    assert.equal(itaAnnotations.isDubbed(snap, 'tv', 9), false, 'un valore fuori contratto non è un sì');
});

test('itaAnnotations - cache con TTL: due letture senza force danno lo stesso oggetto', async () => {
    withFile('{"t":"movie","id":5,"ita":true}\n');

    const first = await itaAnnotations.getSnapshot({ force: true });
    const second = await itaAnnotations.getSnapshot();
    assert.equal(second, first, 'nessuna rilettura dentro il TTL');

    const forced = await itaAnnotations.getSnapshot({ force: true });
    assert.notEqual(forced, first, 'force rilegge');
});

test('itaAnnotations - un file riscritto si vede al giro dopo il force', async () => {
    const file = withFile('{"t":"movie","id":5,"ita":true}\n');
    await itaAnnotations.getSnapshot({ force: true });

    fs.writeFileSync(file, '{"t":"movie","id":5,"ita":null}\n', 'utf8');
    const snap = await itaAnnotations.getSnapshot({ force: true });

    assert.equal(itaAnnotations.getStatus(snap, 'movie', 5), null);
    assert.equal(itaAnnotations.isDubbed(snap, 'movie', 5), false);
});
