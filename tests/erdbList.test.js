const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dumpList = require('../scripts/erdb-builder/dump-list');
const { getErdbId } = require('../src/catalog/formatters/StremioFormatter');

const DUMP_SCRIPT = path.resolve(__dirname, '../scripts/erdb-builder/dump-list.js');

/**
 * Scrive movies.parquet e tv.parquet di prova. Gira in un processo separato per un motivo
 * preciso: su Windows DuckDB tiene il file bloccato (memory map) fino alla fine del processo,
 * quindi chi crea i parquet non puo' cancellarli nella afterEach.
 */
const FIXTURES_SCRIPT = `
    const duckdb = require('duckdb');
    const fs = require('fs');
    const path = require('path');
    const dir = process.argv[1];
    const conIta = process.argv[2] !== 'no-ita';
    const q = (p) => p.replace(/\\\\/g, '/');
    const db = new duckdb.Database(':memory:');
    const con = db.connect();
    const run = (sql) => new Promise((resolve, reject) => con.exec(sql, (e) => e ? reject(e) : resolve()));
    (async () => {
        if (conIta) {
            await run("COPY (SELECT * FROM (VALUES (11::BIGINT, NULL), (27205::BIGINT, true), (157336::BIGINT, false)) t(id, ita)) TO '" + q(path.join(dir, 'movies.parquet')) + "' (FORMAT PARQUET)");
            await run("COPY (SELECT * FROM (VALUES (1399::BIGINT, true), (1400::BIGINT, NULL)) t(id, ita)) TO '" + q(path.join(dir, 'tv.parquet')) + "' (FORMAT PARQUET)");
        } else {
            await run("COPY (SELECT * FROM (VALUES (27205::BIGINT, 'Inception')) t(id, title)) TO '" + q(path.join(dir, 'movies.parquet')) + "' (FORMAT PARQUET)");
            await run("COPY (SELECT * FROM (VALUES (1399::BIGINT, 'Bob Ross')) t(id, name)) TO '" + q(path.join(dir, 'tv.parquet')) + "' (FORMAT PARQUET)");
        }
        con.close(() => db.close(() => process.exit(0)));
    })().catch((err) => { console.error(err); process.exit(1); });
`;

function makeFixtures(dir, { withIta = true } = {}) {
    const result = spawnSync(process.execPath, ['-e', FIXTURES_SCRIPT, dir, withIta ? 'ita' : 'no-ita'], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`fixture non create: ${result.stderr}`);
}

function runDump(args) {
    return spawnSync(process.execPath, [DUMP_SCRIPT, ...args], { encoding: 'utf8' });
}

function readList(out) {
    return fs.readFileSync(out, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

describe('getErdbId resta la fonte di verita\'', () => {
    test('e\' davvero esportata dal formatter Stremio', () => {
        expect(typeof getErdbId).toBe('function');
        expect(dumpList.getErdbId).toBe(getErdbId);
    });

    test('l\'erdbId di un film e di una serie arriva dalla funzione dell\'app', () => {
        // Non ricostruiamo le regole qui: se getErdbId cambia, anche la lista cambia.
        expect(dumpList.rowToEntry({ id: 27205, ita: false }, 'movie'))
            .toEqual({ erdbId: getErdbId({ id: 'tmdb:27205', type: 'movie' }) });
        expect(dumpList.rowToEntry({ id: 1399, ita: false }, 'series'))
            .toEqual({ erdbId: getErdbId({ id: 'tmdb:1399', type: 'series' }) });

        expect(dumpList.rowToEntry({ id: 27205, ita: false }, 'movie').erdbId).toBe('tmdb:movie:27205');
        expect(dumpList.rowToEntry({ id: 1399, ita: false }, 'series').erdbId).toBe('tmdb:tv:1399');
    });

    test('l\'item passato a getErdbId e\' quello che costruisce il provider DuckDB', () => {
        expect(dumpList.toCatalogItem({ id: 27205 }, 'movie')).toEqual({ id: 'tmdb:27205', type: 'movie' });
        expect(dumpList.toCatalogItem({ id: 1399 }, 'series')).toEqual({ id: 'tmdb:1399', type: 'series' });
    });
});

describe('rowToEntry (funzione pura)', () => {
    test('ita === true: la voce porta il badge', () => {
        expect(dumpList.rowToEntry({ id: 27205, ita: true }, 'movie'))
            .toEqual({ erdbId: 'tmdb:movie:27205', badge: 'ITA' });
    });

    test('ita false o null: il campo badge non esiste proprio', () => {
        for (const ita of [false, null, undefined]) {
            const entry = dumpList.rowToEntry({ id: 27205, ita }, 'movie');
            expect(entry).toEqual({ erdbId: 'tmdb:movie:27205' });
            expect('badge' in entry).toBe(false);
            expect(JSON.parse(dumpList.entryToLine(entry))).toEqual({ erdbId: 'tmdb:movie:27205' });
        }
    });

    test('id come BigInt (cosi\' arriva da DuckDB) produce lo stesso erdbId', () => {
        expect(dumpList.rowToEntry({ id: 1399n, ita: true }, 'series'))
            .toEqual({ erdbId: 'tmdb:tv:1399', badge: 'ITA' });
    });

    test('una riga senza id non diventa una voce con erdbId vuoto', () => {
        expect(() => dumpList.rowToEntry({ ita: true }, 'movie')).toThrow(/id/);
        expect(() => dumpList.rowToEntry(null, 'movie')).toThrow(/id/);
    });

    test('entryToLine: una riga JSONL per voce, niente spazi superflui', () => {
        expect(dumpList.entryToLine({ erdbId: 'tmdb:movie:27205', badge: 'ITA' }))
            .toBe('{"erdbId":"tmdb:movie:27205","badge":"ITA"}\n');
        expect(dumpList.entryToLine({ erdbId: 'tmdb:tv:1399' }))
            .toBe('{"erdbId":"tmdb:tv:1399"}\n');
    });

    test('buildSummary: i titoli si contano, i badge stanno dentro il totale', () => {
        expect(dumpList.buildSummary({ totale: 10, conBadge: 4, saltati: 1 }))
            .toEqual({ totale: 10, conBadge: 4, senzaBadge: 6, saltati: 1 });
    });
});

describe('parquet -> lista (CLI, processo separato)', () => {
    let dataDir;

    beforeEach(() => {
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-erdb-list-'));
    });

    afterEach(() => {
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    test('una riga per titolo, badge solo dove ita e\' true, e il riepilogo a fine giro', () => {
        makeFixtures(dataDir);
        const out = path.join(dataDir, 'titoli.jsonl');
        const result = runDump(['--parquet', dataDir, '--out', out]);
        expect(result.status).toBe(0);

        expect(readList(out)).toEqual([
            { erdbId: 'tmdb:movie:11' },
            { erdbId: 'tmdb:movie:27205', badge: 'ITA' },
            { erdbId: 'tmdb:movie:157336' },
            { erdbId: 'tmdb:tv:1399', badge: 'ITA' },
            { erdbId: 'tmdb:tv:1400' }
        ]);

        expect(result.stdout).toMatch(/5 titoli/);
        expect(result.stdout).toMatch(/con badge ITA: 2/);
        expect(result.stdout).toMatch(/senza badge: 3/);
    });

    test('la lista prodotta si lascia rileggere da build.js', () => {
        const build = require('../scripts/erdb-builder/build');
        makeFixtures(dataDir);
        const out = path.join(dataDir, 'titoli.jsonl');
        expect(runDump(['--parquet', dataDir, '--out', out]).status).toBe(0);

        const { entries, errors } = build.parseJsonl(fs.readFileSync(out, 'utf8'));
        expect(errors).toEqual([]);
        expect(entries).toEqual([
            { erdbId: 'tmdb:movie:11', badge: '' },
            { erdbId: 'tmdb:movie:27205', badge: 'ITA' },
            { erdbId: 'tmdb:movie:157336', badge: '' },
            { erdbId: 'tmdb:tv:1399', badge: 'ITA' },
            { erdbId: 'tmdb:tv:1400', badge: '' }
        ]);
        expect(build.posterFileName(entries[1])).toBe('tmdb-movie-27205_ITA.jpg');
        expect(build.posterFileName(entries[0])).toBe('tmdb-movie-11.jpg');
    });

    test('parquet senza la colonna ita: si avvisa e si lista senza badge', () => {
        makeFixtures(dataDir, { withIta: false });
        const out = path.join(dataDir, 'senza-ita.jsonl');
        const result = runDump(['--parquet', dataDir, '--out', out]);

        expect(result.status).toBe(0);
        expect(readList(out)).toEqual([
            { erdbId: 'tmdb:movie:27205' },
            { erdbId: 'tmdb:tv:1399' }
        ]);
        expect(result.stderr).toMatch(/movies\.parquet non ha la colonna "ita"/);
    });

    test('cartella senza parquet: errore che dice cosa manca', () => {
        const result = runDump(['--parquet', dataDir, '--out', path.join(dataDir, 'titoli.jsonl')]);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/movies\.parquet, tv\.parquet/);
        expect(fs.existsSync(path.join(dataDir, 'titoli.jsonl'))).toBe(false);
    });

    test('senza --out lo script non parte', () => {
        const result = runDump(['--parquet', dataDir]);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/--out/);
    });
});

describe('argomenti CLI', () => {
    test('default e forma --flag valore / --flag=valore', () => {
        expect(dumpList.parseArgs(['--out', 'a.jsonl']))
            .toEqual({ parquet: dumpList.DEFAULT_PARQUET_DIR, out: 'a.jsonl', help: false });
        expect(dumpList.parseArgs(['--parquet=/data/x', '--out=b.jsonl']).parquet).toBe('/data/x');
        expect(dumpList.parseArgs(['--help']).help).toBe(true);
        expect(() => dumpList.parseArgs(['--out'])).toThrow(/Manca il valore/);
        expect(() => dumpList.parseArgs(['--boh', 'x'])).toThrow(/Argomento sconosciuto/);
    });

    test('--help spiega anche da dove viene l\'erdbId', () => {
        expect(dumpList.HELP).toMatch(/getErdbId/);
        expect(dumpList.DEFAULT_PARQUET_DIR).toBe('/data/tmdb');
    });

    test('senza --out la funzione rifiuta di partire', async () => {
        await expect(dumpList.dump({ parquetDir: dumpList.DEFAULT_PARQUET_DIR })).rejects.toThrow(/--out/);
    });
});