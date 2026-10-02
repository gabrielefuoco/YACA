const { spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dumpList = require('../scripts/erdb-builder/dump-list');
const { getErdbId } = require('../src/catalog/formatters/StremioFormatter');

/**
 * Runner che passa il dump ma segna gli avvisi di Node. Il warning del leak di listener
 * (MaxListenersExceededWarning) arriva su `process.on('warning')`: e' l'unica traccia del difetto,
 * quindi il test lo intercetta li' invece di fidarsi dello stderr.
 */
const WARNING_RUNNER = `
    const avvisi = [];
    process.on('warning', (avviso) => avvisi.push(avviso.name + ': ' + avviso.message));
    const dumpList = require(process.argv[1]);
    dumpList.main(process.argv.slice(2)).then((riepilogo) => {
        setTimeout(() => {
            for (const avviso of avvisi) console.error('AVVISO ' + avviso);
            process.exit(riepilogo ? 0 : 1);
        });
    }).catch((err) => { console.error(err && err.stack || err); process.exit(2); });
`;

/**
 * Stream finto che simula la backpressure: `write` dice sempre "pieno" e il 'drain' arriva al
 * turno successivo, come fa una write stream vera sotto carico.
 */
function fakeStrozzatoStream() {
    const stream = new EventEmitter();
    stream.write = () => {
        setTimeout(() => stream.emit('drain'), 0);
        return false;
    };
    stream.end = (callback) => {
        if (callback) callback();
        setTimeout(() => stream.emit('finish'), 0);
    };
    return stream;
}

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
            if (process.argv[3] === 'tanti') {
                // 20k righe: abbastanza da far strutturare la write stream piu' volte (ogni
                // strozzatura aggiungeva un listener di errore che non se ne andava piu').
                await run("COPY (SELECT i::BIGINT AS id, (i % 3 = 0) AS ita FROM generate_series(1, 20000) t(i)) TO '" + q(path.join(dir, 'movies.parquet')) + "' (FORMAT PARQUET)");
                await run("COPY (SELECT i::BIGINT AS id, (i % 3 = 0) AS ita FROM generate_series(20001, 24000) t(i)) TO '" + q(path.join(dir, 'tv.parquet')) + "' (FORMAT PARQUET)");
            } else {
            await run("COPY (SELECT * FROM (VALUES (11::BIGINT, NULL), (27205::BIGINT, true), (157336::BIGINT, false)) t(id, ita)) TO '" + q(path.join(dir, 'movies.parquet')) + "' (FORMAT PARQUET)");
            await run("COPY (SELECT * FROM (VALUES (1399::BIGINT, true), (1400::BIGINT, NULL)) t(id, ita)) TO '" + q(path.join(dir, 'tv.parquet')) + "' (FORMAT PARQUET)");
            }
        } else {
            await run("COPY (SELECT * FROM (VALUES (27205::BIGINT, 'Inception')) t(id, title)) TO '" + q(path.join(dir, 'movies.parquet')) + "' (FORMAT PARQUET)");
            await run("COPY (SELECT * FROM (VALUES (1399::BIGINT, 'Bob Ross')) t(id, name)) TO '" + q(path.join(dir, 'tv.parquet')) + "' (FORMAT PARQUET)");
        }
        con.close(() => db.close(() => process.exit(0)));
    })().catch((err) => { console.error(err); process.exit(1); });
`;

function makeFixtures(dir, { withIta = true, tante = false } = {}) {
    const result = spawnSync(
        process.execPath,
        ['-e', FIXTURES_SCRIPT, dir, withIta ? 'ita' : 'no-ita', tante ? 'tanti' : 'pochi'],
        { encoding: 'utf8' }
    );
    if (result.status !== 0) throw new Error(`fixture non create: ${result.stderr}`);
}

function runDump(args) {
    return spawnSync(process.execPath, [DUMP_SCRIPT, ...args], { encoding: 'utf8' });
}

/** Gira il dump in un processo che riporta anche gli avvisi di Node. */
function runDumpConAvvisi(args) {
    return spawnSync(process.execPath, ['-e', WARNING_RUNNER, DUMP_SCRIPT, ...args], { encoding: 'utf8' });
}

/** Raccoglie i warning emessi mentre gira `fn`, senza sporcare il test runner. */
async function raccogliAvvisi(fn) {
    const avvisi = [];
    const onWarning = (avviso) => avvisi.push(avviso);
    process.on('warning', onWarning);
    try {
        await fn();
        // L'avviso e' differito al tick successivo: senza questo await il test passerebbe sempre.
        await new Promise((resolve) => setTimeout(resolve));
    } finally {
        process.removeListener('warning', onWarning);
    }
    return avvisi;
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
describe('scrittura del file: i listener non si accumulano', () => {
    test('50 strozzature di backpressure lasciano un solo listener di errore', async () => {
        const stream = fakeStrozzatoStream();
        const errors = dumpList.trackWriteErrors(stream);

        const avvisi = await raccogliAvvisi(async () => {
            for (let i = 0; i < 50; i += 1) {
                await dumpList.writeLine(stream, `{"erdbId":"tmdb:movie:${i}"}\n`, errors);
            }
        });

        // Prima era uno per riga strozzata: `once('error')` resta sullo stream anche quando e'
        // 'drain' ad aver risolto l'attesa, e Node segnalava MaxListenersExceededWarning.
        expect(stream.listenerCount('error')).toBe(1);
        expect(stream.listenerCount('drain')).toBe(0);
        expect(avvisi.filter((avviso) => avviso.name === 'MaxListenersExceededWarning')).toEqual([]);
    });

    test('chiudere lo stream non aggiunge listener permanenti', async () => {
        const stream = fakeStrozzatoStream();
        const errors = dumpList.trackWriteErrors(stream);

        await dumpList.closeStream(stream, errors);

        expect(stream.listenerCount('error')).toBe(1);
        expect(stream.listenerCount('finish')).toBe(0);
        expect(stream.listenerCount('drain')).toBe(0);
    });

    test('su 24mila righe il giro non emette nessun avviso di Node', () => {
        let dataDir;
        try {
            dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-erdb-list-avvisi-'));
            makeFixtures(dataDir, { tante: true });
            const out = path.join(dataDir, 'titoli.jsonl');
            const result = runDumpConAvvisi(['--parquet', dataDir, '--out', out]);

            expect(result.stderr).not.toMatch(/AVVISO/);
            expect(result.stderr).not.toMatch(/MaxListenersExceededWarning/);
            expect(result.status).toBe(0);
            expect(fs.readFileSync(out, 'utf8').trim().split('\n')).toHaveLength(24000);
        } finally {
            if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
        }
    });
});

describe('un errore di scrittura non passa in silenzio', () => {
    test('errore durante l\'attesa di drain: la promise rigetta con quell\'errore', async () => {
        const stream = new EventEmitter();
        stream.write = () => false; // il buffer e' pieno e il drain non arriva
        stream.end = (callback) => { if (callback) callback(); };
        const errors = dumpList.trackWriteErrors(stream);

        const attesa = dumpList.writeLine(stream, '{"erdbId":"tmdb:movie:1"}\n', errors);
        const guasto = new Error('EACCES: permission denied');
        stream.emit('error', guasto);

        await expect(attesa).rejects.toThrow('EACCES');
        expect(errors.error).toBe(guasto);
        // Niente orfoni: sullo stream non resta un 'drain' che non arrivera\' mai.
        expect(stream.listenerCount('drain')).toBe(0);
    });

    test('closeStream su uno stream rotto rigetta invece di risolversi', async () => {
        const stream = new EventEmitter();
        stream.write = () => true;
        stream.end = () => setTimeout(() => stream.emit('error', new Error('ENOSPC: spazio esaurito')), 0);
        const errors = dumpList.trackWriteErrors(stream);

        await expect(dumpList.closeStream(stream, errors)).rejects.toThrow(/ENOSPC/);
    });

    test('cartella al posto del file: il giro fallisce e lo dice', () => {
        let dataDir;
        try {
            dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-erdb-list-guasto-'));
            makeFixtures(dataDir);
            const out = path.join(dataDir, 'titoli.jsonl');
            // dump-list scrive su <out>.tmp: e\' li\' che mettiamo la cartella.
            fs.mkdirSync(`${out}.tmp`);

            const result = runDump(['--parquet', dataDir, '--out', out]);

            expect(result.status).toBe(1);
            expect(result.stderr).toMatch(/Errore: (EISDIR|EACCES|EPERM)/);
            expect(fs.existsSync(out)).toBe(false);
        } finally {
            if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
        }
    });
});
