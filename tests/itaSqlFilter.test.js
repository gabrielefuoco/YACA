/**
 * tests/itaSqlFilter.test.js
 *
 * Test della colonna `ita` in DuckDB e del filtro `onlyIta` (Ticket 06):
 * 1. Semantica a 3 stati di `F.onlyIta`: true, null, false (senza COALESCE).
 * 2. Wiring in `buildPresetFromFilters` con `onlyIta`, `isDubbed` e `strictIta`.
 * 3. `syncItaAnnotationsLive`: aggiunge la colonna se manca, allinea i valori,
 *    salta al secondo giro se l'mtime è invariato (`already_fresh`).
 * 4. Test di swap: DB su file, UPDATE + CHECKPOINT (elimina il WAL), simulazione dello
 *    swap del daemon e riapertura con riallineamento senza corruzione da WAL stantio.
 * 5. File mancante: no-op, no throw.
 */

const duckdb = require('duckdb');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

describe('Ticket 06 — Filtro onlyIta e Live Sync colonna ita', () => {

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

    describe('2. syncItaAnnotationsLive: aggiunta colonna, allineamento e cache mtime', () => {
        let tempDir;
        let annotationsFile;
        let store;

        beforeEach(async () => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-ita-test-'));
            annotationsFile = path.join(tempDir, 'ita_annotations.jsonl');
            fs.writeFileSync(annotationsFile, [
                JSON.stringify({ t: 'movie', id: 101, ita: true }),
                JSON.stringify({ t: 'movie', id: 102, ita: null }),
                JSON.stringify({ t: 'tv', id: 201, ita: true }),
                JSON.stringify({ t: 'tv', id: 202, ita: null })
            ].join('\n') + '\n', 'utf8');

            process.env.DUCKDB_PATH = ':memory:';
            store = new (duckDbStore.constructor)();
            await store.init();

            // Creiamo tabelle senza la colonna ita per verificare l'ALTER TABLE idempotente
            await execSql(store.con, `
                DROP TABLE IF EXISTS movies;
                DROP TABLE IF EXISTS tv;
                CREATE TABLE movies (id BIGINT, title VARCHAR);
                INSERT INTO movies VALUES
                    (101, 'Movie 101'),
                    (102, 'Movie 102'),
                    (103, 'Movie 103 Senza Annotazione');
                CREATE TABLE tv (id BIGINT, name VARCHAR);
                INSERT INTO tv VALUES
                    (201, 'TV 201'),
                    (202, 'TV 202'),
                    (203, 'TV 203 Senza Annotazione');
            `);
            store._lastItaMtimeMs = null;
        });

        afterEach(async () => {
            delete process.env.ITA_ANNOTATIONS_PATH;
            if (store) await store.close();
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (_) {}
        });

        test('aggiunge la colonna ita se assente e allinea i tre stati su movies e tv', async () => {
            const res = await store.syncItaAnnotationsLive({ annotationsPath: annotationsFile });
            expect(res.synced).toBe(true);
            expect(typeof res.durationMs).toBe('number');

            const movies = await queryAll(store.con, 'SELECT id, ita FROM movies ORDER BY id;');
            expect(movies).toEqual([
                { id: 101n, ita: true },
                { id: 102n, ita: null },
                { id: 103n, ita: false }
            ]);

            const tvs = await queryAll(store.con, 'SELECT id, ita FROM tv ORDER BY id;');
            expect(tvs).toEqual([
                { id: 201n, ita: true },
                { id: 202n, ita: null },
                { id: 203n, ita: false }
            ]);
        });

        test('seconda chiamata con mtime invariato ritorna already_fresh senza ri-eseguire UPDATE', async () => {
            const first = await store.syncItaAnnotationsLive({ annotationsPath: annotationsFile });
            expect(first.synced).toBe(true);

            const second = await store.syncItaAnnotationsLive({ annotationsPath: annotationsFile });
            expect(second).toEqual({ synced: false, reason: 'already_fresh' });

            // Con force: true ri-esegue anche con stesso mtime
            const third = await store.syncItaAnnotationsLive({ annotationsPath: annotationsFile, force: true });
            expect(third.synced).toBe(true);
        });

        test('file assente: no-op, nessun throw, ritorna missing_file', async () => {
            const missingPath = path.join(tempDir, 'non_existent_annotations.jsonl');
            const res = await store.syncItaAnnotationsLive({ annotationsPath: missingPath });
            expect(res).toEqual({ synced: false, reason: 'missing_file' });
        });
    });

    describe('3. Test di swap atomico con CHECKPOINT: prevenzione corruzione da WAL stantio', () => {
        let tempDir;
        let dbFile;
        let annotationsFile;
        let store;

        beforeEach(async () => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-swap-test-'));
            dbFile = path.join(tempDir, 'catalog.duckdb');
            annotationsFile = path.join(tempDir, 'ita_annotations.jsonl');

            fs.writeFileSync(annotationsFile, [
                JSON.stringify({ t: 'movie', id: 1, ita: true }),
                JSON.stringify({ t: 'movie', id: 2, ita: null }),
                JSON.stringify({ t: 'tv', id: 10, ita: true })
            ].join('\n') + '\n', 'utf8');

            process.env.ITA_ANNOTATIONS_PATH = annotationsFile;
            process.env.DUCKDB_PATH = dbFile;
        });

        afterEach(async () => {
            delete process.env.ITA_ANNOTATIONS_PATH;
            if (store) await store.close();
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (_) {}
        });

        test('UPDATE + CHECKPOINT consuma il WAL su file; lo swap del file DB riapre senza replay stantio e il sync ripristina i valori', async () => {
            const walFile = `${dbFile}.wal`;

            // 1. Creazione iniziale del database su file da parte dello store
            store = new (duckDbStore.constructor)();
            await store.init();

            // Popola tabelle di base con schema TMDB e anime_mappings
            await execSql(store.con, `
                DROP TABLE IF EXISTS movies;
                DROP TABLE IF EXISTS tv;
                DROP TABLE IF EXISTS anime_mappings;
                CREATE TABLE movies (id BIGINT, title VARCHAR, ita BOOLEAN);
                INSERT INTO movies VALUES
                    (1, 'Vecchio Movie 1', false),
                    (2, 'Vecchio Movie 2', false),
                    (3, 'Vecchio Movie 3', false);
                CREATE TABLE tv (id BIGINT, name VARCHAR, ita BOOLEAN);
                INSERT INTO tv VALUES
                    (10, 'Vecchia TV 10', false),
                    (20, 'Vecchia TV 20', false);
                CREATE TABLE anime_mappings (tmdb_id BIGINT, tipo VARCHAR, PRIMARY KEY (tmdb_id, tipo));
                CHECKPOINT;
            `);

            // 2. Esegui live sync (ALTER + UPDATE + CHECKPOINT)
            const syncRes = await store.syncItaAnnotationsLive({ annotationsPath: annotationsFile, force: true });
            expect(syncRes.synced).toBe(true);

            // Verifica che i valori siano aggiornati
            const beforeSwap = await queryAll(store.con, 'SELECT id, ita FROM movies ORDER BY id;');
            expect(beforeSwap).toEqual([
                { id: 1n, ita: true },
                { id: 2n, ita: null },
                { id: 3n, ita: false }
            ]);

            // MANDATORY CHECKPOINT VERIFICATION:
            // Grazie a CHECKPOINT;, il file WAL non deve esistere su disco (o essere 0 byte)
            const walExists = fs.existsSync(walFile);
            if (walExists) {
                const walSize = fs.statSync(walFile).size;
                expect(walSize).toBe(0);
            } else {
                expect(walExists).toBe(false);
            }

            // 3. Simula il daemon tmdb che costruisce un NUOVO database su stagingPath e fa rename
            const stagingPath = path.join(tempDir, 'catalog.duckdb.staging');
            const stagingDb = new duckdb.Database(stagingPath);
            const stagingCon = stagingDb.connect();

            await execSql(stagingCon, `
                CREATE TABLE movies (id BIGINT, title VARCHAR, ita BOOLEAN);
                INSERT INTO movies VALUES
                    (1, 'Nuovo TMDB Movie 1', false),
                    (2, 'Nuovo TMDB Movie 2', false),
                    (3, 'Nuovo TMDB Movie 3', false),
                    (4, 'Nuovissimo Movie 4', false);
                CREATE TABLE tv (id BIGINT, name VARCHAR, ita BOOLEAN);
                INSERT INTO tv VALUES
                    (10, 'Nuova TMDB TV 10', false),
                    (20, 'Nuova TMDB TV 20', false);
                CREATE TABLE anime_mappings (tmdb_id BIGINT, tipo VARCHAR, PRIMARY KEY (tmdb_id, tipo));
                CHECKPOINT;
            `);

            await new Promise((resolve) => stagingCon.close(() => stagingDb.close(resolve)));

            // 4. Chiudi la connessione corrente prima di simulare lo swap (gestione lock Windows)
            await store.close();

            // Assicurati ancora che non ci sia WAL stantio dal DB vecchio
            expect(fs.existsSync(walFile) ? fs.statSync(walFile).size === 0 : true).toBe(true);
            if (fs.existsSync(walFile)) {
                fs.unlinkSync(walFile);
            }

            // Simula lo swap atomico del daemon (rename sopra dbFile con retry su Windows)
            let swapped = false;
            for (let i = 0; i < 20; i++) {
                try {
                    try { fs.unlinkSync(dbFile); } catch (_) {}
                    fs.renameSync(stagingPath, dbFile);
                    swapped = true;
                    break;
                } catch (_) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }
            expect(swapped).toBe(true);

            // 5. Riapri lo store sul nuovo database scambiato
            store = new (duckDbStore.constructor)();
            await store.init();

            // Verifica che il database aperto sia quello NUOVO (movie 4 presente)
            const freshRows = await queryAll(store.con, 'SELECT id, title, ita FROM movies ORDER BY id;');
            expect(freshRows.length).toBe(4);
            expect(freshRows[3].title).toBe('Nuovissimo Movie 4');

            // 6. Il sync live riallinea i valori sul nuovo file senza errori Binder o conflitti WAL
            const afterSyncRows = await queryAll(store.con, 'SELECT id, ita FROM movies ORDER BY id;');
            expect(afterSyncRows).toEqual([
                { id: 1n, ita: true },
                { id: 2n, ita: null },
                { id: 3n, ita: false },
                { id: 4n, ita: false }
            ]);

            // Verifica che non sia rimasto alcun file .wal non checkpointato
            if (fs.existsSync(walFile)) {
                expect(fs.statSync(walFile).size).toBe(0);
            }
        });
    });
});
