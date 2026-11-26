/**
 * tests/itaSqlFilter.test.js
 *
 * Test della colonna `ita` in DuckDB e del filtro `onlyIta` (Ticket 06, ridotto dal ticket 17):
 * 1. Semantica a 3 stati di `F.onlyIta`: true, null, false (senza COALESCE).
 * 2. Wiring in `buildPresetFromFilters` con `onlyIta`, `isDubbed` e `strictIta`.
 * 3. `ensureItaColumn`: la colonna esiste sempre (ALTER), e i valori NON vengono toccati —
 *    li scrive `convert_to_parquet`, non più un allineamento a caldo dal JSONL.
 */

const duckdb = require('duckdb');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isola lo stato prima che duckDbStore venga caricato a livello di modulo (Ticket 06 - ermeticità)
const moduleTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-ita-module-'));
process.env.TMDB_DUMP_DIR = moduleTempDir;
process.env.DUCKDB_PATH = path.join(moduleTempDir, 'catalog.duckdb');

const { F } = require('../src/indice/filters');
const { buildPresetFromFilters } = require('../src/indice/duckDbProvider');
const duckDbStore = require('../src/indice/duckDbStore');

function execSql(con, sql) {
    return new Promise((resolve, reject) => {
        con.exec(sql, (err) => (err ? reject(err) : resolve()));
    });
}

function queryAll(con, sql, params = []) {
    return new Promise((resolve, reject) => {
        con.all(sql, ...params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

describe('Ticket 06 — Filtro onlyIta e colonna ita', () => {

    describe('1. Semantica trivalente del filtro F.onlyIta e assenza di COALESCE', () => {
        let db;
        let con;

        beforeAll(async () => {
            db = new duckdb.Database(':memory:');
            con = db.connect();
            await execSql(con, `
                CREATE TABLE movies (
                    id BIGINT,
                    title VARCHAR,
                    ita BOOLEAN,
                    adult BOOLEAN,
                    popularity DOUBLE
                );
                INSERT INTO movies VALUES
                    (1, 'Doppiato Certo', true, false, 90.0),
                    (2, 'Omonimo Ambiguo', NULL, false, 80.0),
                    (3, 'Non Doppiato', false, false, 70.0);
            `);
        });

        afterAll(async () => {
            await new Promise((resolve) => con.close(() => db.close(resolve)));
        });

        test('F.onlyIta non contiene mai la parola chiave COALESCE', () => {
            const permissiveSql = F.onlyIta(false);
            const strictSql = F.onlyIta(true);
            const defaultSql = F.onlyIta();

            expect(permissiveSql.toUpperCase()).not.toContain('COALESCE');
            expect(strictSql.toUpperCase()).not.toContain('COALESCE');
            expect(defaultSql.toUpperCase()).not.toContain('COALESCE');

            expect(permissiveSql).toBe('"ita" IS NOT FALSE');
            expect(defaultSql).toBe('"ita" IS NOT FALSE');
            expect(strictSql).toBe('"ita" IS TRUE');
        });

        test('F.onlyIta(false) include true e null ed esclude false (risultato [1, 2])', async () => {
            const rows = await queryAll(con, `SELECT id FROM movies WHERE ${F.onlyIta(false)} ORDER BY id`);
            expect(rows.map(r => Number(r.id))).toEqual([1, 2]);
        });

        test('F.onlyIta(true) include solo i doppiati certi (risultato [1])', async () => {
            const rows = await queryAll(con, `SELECT id FROM movies WHERE ${F.onlyIta(true)} ORDER BY id`);
            expect(rows.map(r => Number(r.id))).toEqual([1]);
        });

        test('buildPresetFromFilters collega onlyIta, isDubbed e rispetta strictIta', () => {
            const p1 = buildPresetFromFilters({ onlyIta: true }, 'movie');
            expect(p1.where).toContain('"ita" IS NOT FALSE');
            expect(p1.where.join(' ').toUpperCase()).not.toContain('COALESCE');

            const pStrict = buildPresetFromFilters({ onlyIta: true, strictIta: true }, 'movie');
            expect(pStrict.where).toContain('"ita" IS TRUE');

            const pDubbed = buildPresetFromFilters({ isDubbed: true }, 'movie');
            expect(pDubbed.where).toContain('"ita" IS NOT FALSE');

            const pOptions = buildPresetFromFilters({}, 'movie', { onlyIta: true });
            expect(pOptions.where).toContain('"ita" IS NOT FALSE');

            const pOptionsStrict = buildPresetFromFilters({}, 'movie', { onlyIta: true, strictIta: true });
            expect(pOptionsStrict.where).toContain('"ita" IS TRUE');
        });
    });

    describe('2. ensureItaColumn: la colonna esiste sempre, i valori arrivano dal parquet', () => {
        let store;

        beforeEach(() => {
            store = new duckDbStore.DuckDbStore({ basePath: moduleTempDir, dbPath: ':memory:' });
        });

        test('aggiunge la colonna ita a una tabella che non ce l ha', async () => {
            const duckdb = require('duckdb');
            const db = new duckdb.Database(':memory:');
            store.con = db.connect();
            store.activeQueries = 0;
            store._zeroActiveQueriesWaiters = [];
            await new Promise((res, rej) => store.con.exec('CREATE TABLE movies (id BIGINT, title VARCHAR); CREATE TABLE tv (id BIGINT, name VARCHAR);', (e) => (e ? rej(e) : res())));
            const esito = await store.ensureItaColumn();
            expect(esito.ok).toBe(true);
            const colonne = await new Promise((res, rej) => store.con.all("SELECT column_name FROM (DESCRIBE movies)", (e, r) => (e ? rej(e) : res(r))));
            expect(colonne.map((c) => c.column_name)).toContain('ita');
        });

        test('non tocca i valori gia presenti nella colonna', async () => {
            const duckdb = require('duckdb');
            const db = new duckdb.Database(':memory:');
            store.con = db.connect();
            store.activeQueries = 0;
            store._zeroActiveQueriesWaiters = [];
            await new Promise((res, rej) => store.con.exec("CREATE TABLE movies (id BIGINT, ita BOOLEAN); INSERT INTO movies VALUES (1, true), (2, false); CREATE TABLE tv (id BIGINT, ita BOOLEAN);", (e) => (e ? rej(e) : res())));
            await store.ensureItaColumn();
            const righe = await new Promise((res, rej) => store.con.all('SELECT id, ita FROM movies ORDER BY id', (e, r) => (e ? rej(e) : res(r))));
            expect(righe.map((r) => r.ita)).toEqual([true, false]);
        });

        test('senza connessione non lancia', async () => {
            store.con = null;
            await expect(store.ensureItaColumn()).resolves.toEqual({ ok: false, reason: 'no_connection' });
        });
    });
});

afterAll(() => {
    // Il test isola `TMDB_DUMP_DIR`/`DUCKDB_PATH` su una cartella temporanea: va rimossa, o ogni
    // esecuzione ne lascia una dietro.
    try { fs.rmSync(moduleTempDir, { recursive: true, force: true }); } catch (_) {}
});
