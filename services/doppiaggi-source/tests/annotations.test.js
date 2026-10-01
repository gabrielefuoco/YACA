/**
 * Test per src/annotations.js
 * Verifica il contratto di mergeAnnotationRows:
 * - unione per chiave (t, id)
 * - precedenza: true > null > assente
 * - non declassa mai un true
 * - ordinamento stabile
 * - lettura da NDJSON
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mergeAnnotationRows, readAnnotationRows, parseAnnotationRow } = require('../src/annotations');

test('annotations - parseAnnotationRow normalizza id numerici e stringhe tmdb', () => {
    assert.deepEqual(parseAnnotationRow({ t: 'movie', id: 10, ita: true }), { t: 'movie', id: 10, ita: true });
    assert.deepEqual(parseAnnotationRow({ type: 'series', id: 'tmdb:tv:20', ita: null }), { t: 'tv', id: 20, ita: null });
    assert.deepEqual(parseAnnotationRow('{"t":"movie","id":30,"ita":true}'), { t: 'movie', id: 30, ita: true });
    assert.equal(parseAnnotationRow({ t: 'movie', id: 40, ita: false }), null, 'ita: false vale assente');
    assert.equal(parseAnnotationRow(null), null);
    assert.equal(parseAnnotationRow({}), null);
});

test('annotations - mergeAnnotationRows: unisce per chiave (t, id) con precedenza true > null > assente', () => {
    const base = [
        { t: 'movie', id: 1, ita: true },
        { t: 'movie', id: 2, ita: null },
        { t: 'tv', id: 10, ita: null }
    ];
    const extra = [
        { t: 'movie', id: 2, ita: true },  // decolla da null a true
        { t: 'tv', id: 10, ita: null },   // resta null
        { t: 'movie', id: 3, ita: true },  // nuovo true
        { t: 'tv', id: 20, ita: null }    // nuovo null
    ];

    const merged = mergeAnnotationRows(base, extra);
    assert.deepEqual(merged, [
        { t: 'movie', id: 1, ita: true },
        { t: 'movie', id: 2, ita: true },
        { t: 'movie', id: 3, ita: true },
        { t: 'tv', id: 10, ita: null },
        { t: 'tv', id: 20, ita: null }
    ]);
});

test('annotations - mergeAnnotationRows: non declassa mai un true', () => {
    const base = [
        { t: 'movie', id: 100, ita: true },
        { t: 'tv', id: 200, ita: true }
    ];
    const extra = [
        { t: 'movie', id: 100, ita: null },
        { t: 'tv', id: 200, ita: null }
    ];

    const merged = mergeAnnotationRows(base, extra);
    assert.deepEqual(merged, [
        { t: 'movie', id: 100, ita: true },
        { t: 'tv', id: 200, ita: true }
    ]);
});

test('annotations - mergeAnnotationRows: non crea duplicati e gestisce input vuoti o null', () => {
    const base = [{ t: 'movie', id: 5, ita: true }];
    const extra = [{ t: 'movie', id: 5, ita: true }];

    assert.deepEqual(mergeAnnotationRows(base, extra), [{ t: 'movie', id: 5, ita: true }]);
    assert.deepEqual(mergeAnnotationRows(null, base), [{ t: 'movie', id: 5, ita: true }]);
    assert.deepEqual(mergeAnnotationRows(base, undefined), [{ t: 'movie', id: 5, ita: true }]);
    assert.deepEqual(mergeAnnotationRows([], []), []);
});

test('annotations - mergeAnnotationRows: ordinamento stabile (t alfabetico: movie prima di tv, poi id numerico crescente)', () => {
    const rows = [
        { t: 'tv', id: 50, ita: true },
        { t: 'movie', id: 99, ita: true },
        { t: 'tv', id: 10, ita: null },
        { t: 'movie', id: 2, ita: true }
    ];

    const merged = mergeAnnotationRows([], rows);
    assert.deepEqual(merged.map((r) => `${r.t}:${r.id}`), [
        'movie:2',
        'movie:99',
        'tv:10',
        'tv:50'
    ]);
});

test('annotations - readAnnotationRows: legge file NDJSON reale ignorando righe invalide', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'annotations-test-'));
    const file = path.join(tmpDir, 'test_annotations.jsonl');
    const content = [
        '{"t":"movie","id":1,"ita":true}',
        '{"t":"tv","id":2,"ita":null}',
        '{"t":"movie","id":3,"ita":false}', // deve essere ignorato
        'invalid json',                     // deve essere ignorato
        ''
    ].join('\n');
    fs.writeFileSync(file, content, 'utf8');

    const rows = await readAnnotationRows(file);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows, [
        { t: 'movie', id: 1, ita: true },
        { t: 'tv', id: 2, ita: null }
    ]);

    const nonExistent = await readAnnotationRows(path.join(tmpDir, 'does-not-exist.jsonl'));
    assert.deepEqual(nonExistent, []);
});
