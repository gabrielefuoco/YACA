/**
 * Test del writer delle annotazioni (formato deciso dal ticket 04 della mappa doppiaggio-ita:
 * NDJSON, chiave (tipo, id), solo true/null, riga assente = false).
 * Tutto offline, su una cartella temporanea.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { toRows, writeAnnotations, metaPathFor, DEFAULT_FILENAME } = require('../src/writer');

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'doppiaggi-writer-'));
}

const SAMPLE = [
    { id: 'tmdb:movie:20', type: 'movie', title: 'Venti', year: 2000, ita: true },
    { id: 'tmdb:tv:30', type: 'series', title: 'Trenta', year: 2010, ita: null },
    { id: 'tmdb:movie:10', type: 'movie', title: 'Dieci', year: 1990, ita: false },
    { id: 'tmdb:tv:5', type: 'series', title: 'Cinque', year: 1980, ita: true }
];

test('writer - il tipo fa parte della chiave e `series` diventa `tv`', () => {
    const rows = toRows([
        { id: 'tmdb:movie:5920', type: 'movie', ita: true },
        { id: 'tmdb:tv:5920', type: 'series', ita: true }
    ]);
    assert.equal(rows.length, 2, 'due opere diverse con lo stesso id numerico non si fondono');
    assert.deepEqual(rows, [
        { t: 'movie', id: 5920, ita: true },
        { t: 'tv', id: 5920, ita: true }
    ]);
});

test('writer - solo true e null finiscono nel file, in ordine stabile', () => {
    const rows = toRows(SAMPLE);
    assert.equal(rows.length, 3, 'il record false non entra nel file');
    assert.ok(!rows.some((r) => r.ita === false));
    assert.deepEqual(rows.map((r) => `${r.t}:${r.id}`), ['movie:20', 'tv:5', 'tv:30']);
});

test('writer - scrive NDJSON + meta, e non lascia file temporanei', async () => {
    const dir = tempDir();
    const out = path.join(dir, DEFAULT_FILENAME);

    const res = await writeAnnotations(SAMPLE, { outputPath: out });
    assert.equal(res.written, true);
    assert.equal(res.counts.rows, 3);
    assert.equal(res.counts.true, 2);
    assert.equal(res.counts.null, 1);

    const lines = fs.readFileSync(out, 'utf8').trim().split('\n');
    assert.equal(lines.length, 3);
    for (const line of lines) {
        const row = JSON.parse(line);
        assert.deepEqual(Object.keys(row).sort(), ['id', 'ita', 't']);
        assert.ok(row.t === 'movie' || row.t === 'tv');
        assert.ok(row.ita === true || row.ita === null);
        assert.equal(typeof row.id, 'number');
    }

    const meta = JSON.parse(fs.readFileSync(metaPathFor(out), 'utf8'));
    assert.equal(meta.schemaVersion, 1);
    assert.equal(meta.counts.rows, 3);
    assert.equal(meta.counts.true, 2);
    assert.ok(meta.generatedAt);
    assert.ok(meta.source.includes('antoniogenna'));

    assert.ok(!fs.existsSync(`${out}.tmp`), 'nessun file temporaneo residuo');
});

test('writer - dry-run: non scrive niente', async () => {
    const dir = tempDir();
    const out = path.join(dir, DEFAULT_FILENAME);
    const res = await writeAnnotations(SAMPLE, { outputPath: out, dryRun: true });
    assert.equal(res.written, false);
    assert.equal(res.reason, 'dry-run');
    assert.equal(res.counts.rows, 3);
    assert.equal(fs.existsSync(out), false);
    assert.equal(fs.existsSync(metaPathFor(out)), false);
});

test('writer - senza outputPath e senza dry-run è un errore', async () => {
    await assert.rejects(() => writeAnnotations(SAMPLE, {}), /outputPath/);
});

test('writer - guardia: un calo oltre il 2% non sovrascrive il file valido', async () => {
    const dir = tempDir();
    const out = path.join(dir, DEFAULT_FILENAME);

    await writeAnnotations(SAMPLE, { outputPath: out }); // 2 veri
    const before = fs.readFileSync(out, 'utf8');

    // giro successivo con 0 veri (calo del 100%): deve essere rifiutato
    const res = await writeAnnotations(
        [{ id: 'tmdb:tv:30', type: 'series', ita: null }],
        { outputPath: out }
    );
    assert.equal(res.written, false);
    assert.equal(res.reason, 'guard');
    assert.equal(res.counts.true, 0);
    assert.equal(res.previous.counts.true, 2);
    assert.equal(fs.readFileSync(out, 'utf8'), before, 'il file precedente resta intatto');
});

test('writer - guardia: un calo piccolo (entro il 2%) passa', async () => {
    const dir = tempDir();
    const out = path.join(dir, DEFAULT_FILENAME);

    // 100 veri
    const big = [];
    for (let i = 0; i < 100; i++) big.push({ id: `tmdb:movie:${i}`, type: 'movie', ita: true });
    await writeAnnotations(big, { outputPath: out });

    // 99 veri: -1%, tollerato
    const res = await writeAnnotations(big.slice(1), { outputPath: out });
    assert.equal(res.written, true);
    assert.equal(res.counts.true, 99);
});

test('writer - la guardia si può disattivare esplicitamente', async () => {
    const dir = tempDir();
    const out = path.join(dir, DEFAULT_FILENAME);
    await writeAnnotations(SAMPLE, { outputPath: out });
    const res = await writeAnnotations([{ id: 'tmdb:tv:30', type: 'series', ita: null }], {
        outputPath: out,
        respectGuard: false
    });
    assert.equal(res.written, true);
    assert.equal(res.counts.true, 0);
});
