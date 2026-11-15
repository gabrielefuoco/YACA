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

test('Tier 1 Spool - Caso 1: promozione concorrente con upsert non viene persa (fusa al giro successivo)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier1-race-'));
    try {
        const store = new TmdbDumpStore(tmpDir);
        store.appendBatch([
            { id: 100, title: 'Film Base 100', popularity: 10 },
            { id: 101, title: 'Film Base 101', popularity: 20 }
        ], 'movies');

        const masterPath = tier1FileFor('movie', tmpDir);
        const [upsertRes, promoRes] = await Promise.all([
            store.upsert([{ id: 100, title: 'Film Base 100 Aggiornato', popularity: 15 }], 'movies'),
            promoteToTier1(masterPath, { id: 999, title: 'Film 999 Promosso Lazy', popularity: 5 }, 'movie')
        ]);

        assert.equal(promoRes.scritto, true);
        assert.equal(promoRes.percorso, promotedFileFor('movie', tmpDir));

        // Al giro successivo di upsert lo spool viene fuso nel master
        await store.upsert([{ id: 101, title: 'Film Base 101 Aggiornato', popularity: 25 }], 'movies');

        const finalIds = await store.loadIds('movies');
        assert.ok(finalIds.has(100));
        assert.ok(finalIds.has(101));
        assert.ok(finalIds.has(999), 'Il titolo 999 promosso durante il rename non deve andare perso');

        // Lo spool deve essere stato troncato dal daemon
        const spoolContent = fs.readFileSync(promoRes.percorso, 'utf8');
        assert.equal(spoolContent.trim(), '');
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

test('Tier 1 Spool - Caso 3: chiamare upsert due volte con spool non troncato a mano non produce duplicati nel master', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier1-notrunc-'));
    try {
        const store = new TmdbDumpStore(tmpDir);
        const masterPath = tier1FileFor('movie', tmpDir);
        const spoolPath = promotedFileFor('movie', tmpDir);

        store.appendBatch([
            { id: 10, title: 'Film 10', popularity: 1 }
        ], 'movies');

        const promotedRow = { id: 20, title: 'Film Promosso 20', popularity: 2, _fetched_at: '2026-01-01T00:00:00.000Z' };
        fs.writeFileSync(spoolPath, JSON.stringify(promotedRow) + '\n', 'utf8');

        // Primo upsert: unisce la riga dallo spool
        await store.upsert([{ id: 30, title: 'Film 30', popularity: 3 }], 'movies');

        // Simuliamo un crash o spool rimasto non troncato riscritturando la riga nello spool
        fs.writeFileSync(spoolPath, JSON.stringify(promotedRow) + '\n', 'utf8');

        // Secondo upsert: riesegue il merge della stessa riga dallo spool
        await store.upsert([{ id: 40, title: 'Film 40', popularity: 4 }], 'movies');

        const masterLines = fs.readFileSync(masterPath, 'utf8').trim().split('\n').filter(Boolean);
        const masterRows = masterLines.map(l => JSON.parse(l));
        const ids = masterRows.map(r => r.id);

        assert.equal(ids.filter(id => id === 20).length, 1, 'id 20 deve comparire esattamente una volta');
        assert.equal(masterRows.length, 4); // 10, 20, 30, 40
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
