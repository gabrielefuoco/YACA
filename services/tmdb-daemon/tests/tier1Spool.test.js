const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const duckdb = require('duckdb');

const TmdbDumpStore = require('../tmdbDumpStore');
const {
    promoteToTier1,
    tier1FileFor,
    promotedFileFor,
    hasTier1Id
} = require('../../../src/indice/tier1Promotion');
const { buildConversionSelect } = require('../../../scripts/convert_to_parquet');

test('Tier 1 Spool - Crash matrix (a) normal: spool drained, master updated, no .draining left', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier1-matrix-a-'));
    try {
        const store = new TmdbDumpStore(tmpDir);
        const masterPath = tier1FileFor('movie', tmpDir);
        const spoolPath = promotedFileFor('movie', tmpDir);
        const drainingPath = spoolPath + '.draining';

        // Master di partenza
        store.appendBatch([
            { id: 100, title: 'Film Base 100', popularity: 10 },
            { id: 101, title: 'Film Base 101', popularity: 20 }
        ], 'movies');

        // Spool popolato da promozione lazy
        const promoRes = await promoteToTier1(masterPath, { id: 200, title: 'Film Promosso 200', popularity: 50 }, 'movie');
        assert.equal(promoRes.scritto, true);
        assert.equal(fs.existsSync(spoolPath), true);

        // Upsert del daemon: aggiorna id 100 e aggiunge id 102
        await store.upsert([
            { id: 100, title: 'Film Base 100 Aggiornato', popularity: 15 },
            { id: 102, title: 'Film Base 102', popularity: 30 }
        ], 'movies');

        // Asserzioni (a):
        // 1. Spool drenato: il file di spool e il file .draining non esistono più
        assert.equal(fs.existsSync(drainingPath), false, 'Nessun .draining deve rimanere');
        assert.equal(fs.existsSync(spoolPath), false, 'Lo spool deve essere stato drenato dal claim-by-rename');

        // 2. Master aggiornato con righe upsert + riga dallo spool
        const ids = await store.loadIds('movies');
        assert.ok(ids.has(100), 'id 100 presente');
        assert.ok(ids.has(101), 'id 101 presente');
        assert.ok(ids.has(102), 'id 102 presente');
        assert.ok(ids.has(200), 'id 200 dallo spool presente nel master');

        const masterLines = fs.readFileSync(masterPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
        const row100 = masterLines.find(r => r.id === 100);
        assert.equal(row100.title, 'Film Base 100 Aggiornato');
        assert.equal(row100.popularity, 15);
        const row200 = masterLines.find(r => r.id === 200);
        assert.equal(row200.title, 'Film Promosso 200');
        assert.equal(row200.popularity, 50);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier 1 Spool - Crash matrix (b) crash simulated: leftover .draining merged into master and removed', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier1-matrix-b-'));
    try {
        const store = new TmdbDumpStore(tmpDir);
        const masterPath = tier1FileFor('movie', tmpDir);
        const spoolPath = promotedFileFor('movie', tmpDir);
        const drainingPath = spoolPath + '.draining';

        // Master esistente con id 10
        store.appendBatch([
            { id: 10, title: 'Film Base 10', popularity: 1 }
        ], 'movies');

        // Simuliamo un crash lasciando un .draining orfano prima di chiamare upsert
        const crashedRows = [
            { id: 50, title: 'Film Orfano 50', popularity: 5 },
            { id: 60, title: 'Film Orfano 60', popularity: 6 }
        ];
        fs.writeFileSync(drainingPath, crashedRows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
        assert.equal(fs.existsSync(drainingPath), true);
        assert.equal(fs.existsSync(spoolPath), false);

        // Chiamata di upsert: deve recuperare le righe del .draining
        await store.upsert([
            { id: 70, title: 'Film Upsert 70', popularity: 7 }
        ], 'movies');

        // Asserzioni (b):
        // 1. Le righe del .draining finiscono nel master
        const ids = await store.loadIds('movies');
        assert.ok(ids.has(10), 'id 10 base presente');
        assert.ok(ids.has(50), 'id 50 dal .draining orfano deve finire nel master');
        assert.ok(ids.has(60), 'id 60 dal .draining orfano deve finire nel master');
        assert.ok(ids.has(70), 'id 70 dalla chiamata upsert presente');

        // 2. Il file .draining viene rimosso
        assert.equal(fs.existsSync(drainingPath), false, 'Il file .draining deve essere rimosso dopo il merge');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier 1 Spool - Crash matrix (c) promotion appended right after claim: survives into next cycle, master keeps idempotence', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier1-matrix-c-'));
    try {
        const store = new TmdbDumpStore(tmpDir);
        const masterPath = tier1FileFor('movie', tmpDir);
        const spoolPath = promotedFileFor('movie', tmpDir);
        const drainingPath = spoolPath + '.draining';

        store.appendBatch([
            { id: 100, title: 'Film Base 100', popularity: 10 }
        ], 'movies');

        // Promozione iniziale nello spool (id 200)
        await promoteToTier1(masterPath, { id: 200, title: 'Film Promosso 200', popularity: 20 }, 'movie');

        // Intercettiamo _processFileSafely: viene eseguito dopo il rename di claim (spoolPath -> claimed)
        // e prima della riscrittura del master.
        const originalProcess = store._processFileSafely.bind(store);
        let concurrentAppended = false;

        store._processFileSafely = async function(filePath, lineProcessorFn, onEndFn) {
            // A questo punto il claim è avvenuto: claimed esiste, spoolPath è stato rinominato
            assert.equal(fs.existsSync(drainingPath), true, 'Il file .draining esiste durante la riscrittura del master');
            assert.equal(fs.existsSync(spoolPath), false, 'Lo spool originale è stato rinominato in .draining');

            // Nuova promozione concorrente che atterra sul nuovo spoolPath (creato dal writer)
            const res = await promoteToTier1(masterPath, { id: 300, title: 'Film Concorrente 300', popularity: 30 }, 'movie');
            assert.equal(res.scritto, true);
            assert.equal(fs.existsSync(spoolPath), true, 'Nuovo promoted_*.jsonl creato dal writer');
            concurrentAppended = true;

            return originalProcess(filePath, lineProcessorFn, onEndFn);
        };

        // Primo ciclo di upsert: unisce id 200; durante l'elaborazione atterra id 300 nel nuovo spool
        await store.upsert([{ id: 100, title: 'Film Base 100 V1', popularity: 11 }], 'movies');
        assert.equal(concurrentAppended, true);

        // Asserzioni fine primo ciclo:
        // id 200 è nel master, id 300 è ancora nel nuovo spoolPath
        const idsCiclo1 = await store.loadIds('movies');
        assert.ok(idsCiclo1.has(100));
        assert.ok(idsCiclo1.has(200), 'id 200 deve essere nel master al primo ciclo');
        assert.equal(idsCiclo1.has(300), false, 'id 300 non è ancora nel master al primo ciclo');
        assert.equal(fs.existsSync(drainingPath), false, 'Il .draining del primo ciclo è stato rimosso');
        assert.equal(fs.existsSync(spoolPath), true, 'Il nuovo spool con id 300 è sopravvissuto intatto');

        // Ripristiniamo _processFileSafely normale
        store._processFileSafely = originalProcess;

        // Secondo ciclo di upsert: drena il nuovo spool contenente id 300 e re-invia id 200 per verificare l'idempotenza
        await store.upsert([
            { id: 200, title: 'Film Promosso 200 Re-Upsert', popularity: 25 }
        ], 'movies');

        // Asserzioni fine secondo ciclo:
        const finalIds = await store.loadIds('movies');
        assert.ok(finalIds.has(100));
        assert.ok(finalIds.has(200));
        assert.ok(finalIds.has(300), 'id 300 è sopravvissuto ed è stato fuso nel master al secondo ciclo');

        assert.equal(fs.existsSync(drainingPath), false, 'Nessun .draining deve rimanere');
        assert.equal(fs.existsSync(spoolPath), false, 'Lo spool è stato completamente drenato');

        // Verifica idempotenza nel master: nessun duplicato
        const masterLines = fs.readFileSync(masterPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
        assert.equal(masterLines.filter(r => r.id === 200).length, 1, 'id 200 compare esattamente una volta nel master');
        assert.equal(masterLines.filter(r => r.id === 300).length, 1, 'id 300 compare esattamente una volta nel master');
        const row200 = masterLines.find(r => r.id === 200);
        assert.equal(row200.title, 'Film Promosso 200 Re-Upsert');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier 1 Spool - Caso 2: promuovere lo stesso id due volte scrive una volta sola', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier1-dup-'));
    try {
        const masterPath = tier1FileFor('movie', tmpDir);
        const res1 = await promoteToTier1(masterPath, { id: 555, title: 'Film 555' }, 'movie');
        assert.equal(res1.scritto, true);
        assert.equal(res1.percorso, promotedFileFor('movie', tmpDir));

        const res2 = await promoteToTier1(masterPath, { id: 555, title: 'Film 555 Ripetuto' }, 'movie');
        assert.equal(res2.scritto, false);
        assert.match(res2.motivo, /già presente/);

        const spoolLines = fs.readFileSync(res1.percorso, 'utf8').trim().split('\n').filter(Boolean);
        assert.equal(spoolLines.length, 1);
        assert.equal(JSON.parse(spoolLines[0]).id, 555);

        assert.equal(await hasTier1Id(masterPath, 555), true);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Tier 1 Spool - Caso 4: convert_to_parquet leggendo master+spool mantiene la riga più fresca per lo stesso id', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier1-parquet-'));
    try {
        const masterPath = path.join(tmpDir, 'master_movies.jsonl');
        const spoolPath = path.join(tmpDir, 'promoted_movies.jsonl');

        const olderRow = {
            id: 88,
            title: 'Film Vecchio nel Master',
            popularity: 10,
            _fetched_at: '2026-01-01T00:00:00.000Z'
        };
        const fresherRow = {
            id: 88,
            title: 'Film Fresco nello Spool',
            popularity: 99,
            _fetched_at: '2026-02-01T00:00:00.000Z'
        };

        fs.writeFileSync(masterPath, JSON.stringify(olderRow) + '\n', 'utf8');
        fs.writeFileSync(spoolPath, JSON.stringify(fresherRow) + '\n', 'utf8');

        const selectSql = buildConversionSelect([masterPath, spoolPath], true);
        assert.ok(selectSql.includes(masterPath.replace(/\\/g, '/')));
        assert.ok(selectSql.includes(spoolPath.replace(/\\/g, '/')));

        const db = new duckdb.Database(':memory:');
        const con = db.connect();

        const rows = await new Promise((resolve, reject) => {
            con.all(selectSql, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        });

        assert.equal(rows.length, 1, 'Deduplicazione per id deve produrre esattamente una riga');
        assert.equal(Number(rows[0].id), 88);
        assert.equal(rows[0].title, 'Film Fresco nello Spool');
        assert.equal(Number(rows[0].popularity), 99);

        await new Promise(resolve => con.close(resolve));
        await new Promise(resolve => db.close(resolve));
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});
