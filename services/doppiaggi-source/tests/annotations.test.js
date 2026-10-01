/**
 * annotations.test.js
 * Test unitari offline per mergeAnnotationRows e inspectMerge.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeAnnotationRows, inspectMerge } = require('../src/annotations');

test('mergeAnnotationRows - aggiunge nuove righe assenti in base', () => {
    const base = [
        { t: 'movie', id: 10, ita: true },
        { t: 'tv', id: 20, ita: null }
    ];
    const extra = [
        { t: 'tv', id: 30, ita: true }
    ];
    const res = mergeAnnotationRows(base, extra);
    assert.equal(res.length, 3);
    assert.deepEqual(res, [
        { t: 'movie', id: 10, ita: true },
        { t: 'tv', id: 20, ita: null },
        { t: 'tv', id: 30, ita: true }
    ]);
});

test('mergeAnnotationRows - promuove null di base a true se extra è true', () => {
    const base = [
        { t: 'tv', id: 100, ita: null }
    ];
    const extra = [
        { t: 'tv', id: 100, ita: true }
    ];
    const res = mergeAnnotationRows(base, extra);
    assert.equal(res.length, 1);
    assert.equal(res[0].ita, true, 'il null deve essere promosso a true');
});

test('mergeAnnotationRows - mai declassare un true (true vince su null)', () => {
    const base = [
        { t: 'tv', id: 200, ita: true }
    ];
    const extra = [
        { t: 'tv', id: 200, ita: null }
    ];
    const res = mergeAnnotationRows(base, extra);
    assert.equal(res.length, 1);
    assert.equal(res[0].ita, true, 'un true esistente non deve mai essere declassato a null');
});

test('mergeAnnotationRows - due true restano true', () => {
    const base = [{ t: 'movie', id: 50, ita: true }];
    const extra = [{ t: 'movie', id: 50, ita: true }];
    const res = mergeAnnotationRows(base, extra);
    assert.equal(res.length, 1);
    assert.equal(res[0].ita, true);
});

test('mergeAnnotationRows - due null restano null', () => {
    const base = [{ t: 'tv', id: 60, ita: null }];
    const extra = [{ t: 'tv', id: 60, ita: null }];
    const res = mergeAnnotationRows(base, extra);
    assert.equal(res.length, 1);
    assert.equal(res[0].ita, null);
});

test('mergeAnnotationRows - la chiave include il tipo: movie e tv con stesso id non si fondono', () => {
    const base = [
        { t: 'movie', id: 5920, ita: true }
    ];
    const extra = [
        { t: 'tv', id: 5920, ita: true }
    ];
    const res = mergeAnnotationRows(base, extra);
    assert.equal(res.length, 2);
    assert.deepEqual(res, [
        { t: 'movie', id: 5920, ita: true },
        { t: 'tv', id: 5920, ita: true }
    ]);
});

test('mergeAnnotationRows - ordinamento stabile per (t, id) con movie prima di tv', () => {
    const base = [
        { t: 'tv', id: 500, ita: true },
        { t: 'movie', id: 999, ita: true },
        { t: 'tv', id: 10, ita: null }
    ];
    const extra = [
        { t: 'movie', id: 5, ita: true }
    ];
    const res = mergeAnnotationRows(base, extra);
    assert.deepEqual(
        res.map((r) => `${r.t}:${r.id}`),
        ['movie:5', 'movie:999', 'tv:10', 'tv:500']
    );
});

test('mergeAnnotationRows - scarta righe con ita false o id non validi', () => {
    const base = [
        { t: 'tv', id: 1, ita: false },
        { t: 'tv', id: NaN, ita: true },
        { t: 'invalid_type', id: 2, ita: true }
    ];
    const extra = [
        { t: 'tv', id: 3, ita: true }
    ];
    const res = mergeAnnotationRows(base, extra);
    assert.equal(res.length, 1);
    assert.deepEqual(res[0], { t: 'tv', id: 3, ita: true });
});

test('mergeAnnotationRows - immutabilità: non modifica gli array né gli oggetti originali', () => {
    const rowBase = { t: 'tv', id: 77, ita: null };
    const base = [rowBase];
    const extra = [{ t: 'tv', id: 77, ita: true }];

    const res = mergeAnnotationRows(base, extra);
    assert.equal(rowBase.ita, null, 'l oggetto originale base non deve essere mutato');
    assert.equal(res[0].ita, true);
    assert.notEqual(res[0], rowBase);
});

test('inspectMerge - calcola correttamente le statistiche di aggiunta e promozione', () => {
    const base = [
        { t: 'movie', id: 1, ita: true },   // untouched
        { t: 'tv', id: 2, ita: null },      // promoted
        { t: 'tv', id: 3, ita: true }       // alreadyTrue
    ];
    const extra = [
        { t: 'tv', id: 2, ita: true },      // promote id 2
        { t: 'tv', id: 3, ita: true },      // already true id 3
        { t: 'movie', id: 4, ita: true }    // added id 4
    ];

    const stats = inspectMerge(base, extra);
    assert.equal(stats.totalBase, 3);
    assert.equal(stats.totalExtra, 3);
    assert.equal(stats.totalMerged, 4);
    assert.equal(stats.mergedTrue, 4);
    assert.equal(stats.mergedNull, 0);
    assert.equal(stats.addedRows, 1);
    assert.equal(stats.promotedRows, 1);
    assert.equal(stats.alreadyTrue, 1);
    assert.equal(stats.downgradedRows, 0);
});
