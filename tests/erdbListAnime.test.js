const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dumpListAnime = require('../scripts/erdb-builder/dump-list-anime');

const DUMP_SCRIPT = path.resolve(__dirname, '../scripts/erdb-builder/dump-list-anime.js');

/**
 * Scrive movies.parquet e tv.parquet di prova, piu' l'indice Fribb sintetico.
 * Gira in un processo separato per un motivo preciso (uguale a `erdbList.test.js`): su Windows
 * DuckDB tiene il file bloccato (memory map) fino alla fine del processo, quindi chi crea i
 * parquet non puo' cancellarli nella afterEach.
 */
const FIXTURES_SCRIPT = `
    const duckdb = require('duckdb');
    const fs = require('fs');
    const path = require('path');
    const dir = process.argv[1];
    const q = (p) => p.replace(/\\\\/g, '/');
    const db = new duckdb.Database(':memory:');
    const con = db.connect();
    const run = (sql) => new Promise((resolve, reject) => con.exec(sql, (e) => e ? reject(e) : resolve()));
    (async () => {
        // 240411 e' la serie doppiata, 240412 no; 999005 e' il film doppiato, 999006 no.
        await run("COPY (SELECT * FROM (VALUES (240411::BIGINT, true), (240412::BIGINT, false), (999005::BIGINT, true), (999006::BIGINT, false)) t(id, ita)) TO '" + q(path.join(dir, 'movies.parquet')) + "' (FORMAT PARQUET)");
        await run("COPY (SELECT * FROM (VALUES (1399::BIGINT, true), (1400::BIGINT, NULL)) t(id, ita)) TO '" + q(path.join(dir, 'tv.parquet')) + "' (FORMAT PARQUET)");
        con.close(() => db.close(() => process.exit(0)));
    })().catch((err) => { console.error(err); process.exit(1); });
`;

/**
 * Indice Fribb sintetico: copre tutte le forme del file reale che contano qui.
 *  - 1399 e' in tv.parquet con ita true  -> badge
 *  - 1400 e' in tv.parquet con ita null  -> senza badge
 *  - 240411 e' in movies.parquet con true -> badge
 *  - 999005 e' in movies.parquet con true -> badge (movie e' un array)
 *  - 999006 e' in movies.parquet con false-> senza badge
 *  - 777777 non e' in nessun parquet     -> senza badge
 */
const RECORDS_FRIBB = [
    { kitsu_id: 48269, themoviedb_id: { tv: 1399 } },              // doppiato (tv)
    { kitsu_id: 48270, themoviedb_id: { tv: 1400 } },              // in catalogo, non doppiato
    { kitsu_id: 11614, themoviedb_id: { movie: 240411 } },         // doppiato (film)
    { kitsu_id: 11615, themoviedb_id: { movie: [999005] } },       // doppiato (film, array)
    { kitsu_id: 11616, themoviedb_id: { movie: [999006, 240412] } }, // non doppiato
    { kitsu_id: 11617, themoviedb_id: { tv: 777777 } },            // non in catalogo
    { kitsu_id: 11618, themoviedb_id: { movie: [777777, 999005] } }, // un film doppiato basta
    { kitsu_id: 11619, themoviedb_id: null },                      // salta: senza id TMDB
    { kitsu_id: 11620 },                                           // salta: niente themoviedb_id
    { kitsu_id: 11621, themoviedb_id: {} },                         // salta: id TMDB vuoto
    { themoviedb_id: { tv: 1399 } },                               // salta: senza kitsu_id
    { kitsu_id: null, themoviedb_id: { tv: 1399 } },               // salta: kitsu_id null
    { kitsu_id: '', themoviedb_id: { tv: 1399 } },                 // salta: kitsu_id vuoto
    { kitsu_id: 'n/a', themoviedb_id: { tv: 1399 } }               // salta: kitsu_id sporco
];

function makeFixtures(dir) {
    const result = spawnSync(process.execPath, ['-e', FIXTURES_SCRIPT, dir], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`fixture non create: ${result.stderr}`);
}

function makeFribb(dir, records = RECORDS_FRIBB) {
    const file = path.join(dir, 'fribb-mini.json');
    fs.writeFileSync(file, JSON.stringify(records), 'utf8');
    return file;
}

function runDump(args) {
    return spawnSync(process.execPath, [DUMP_SCRIPT, ...args], { encoding: 'utf8' });
}

function readList(out) {
    return fs.readFileSync(out, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

describe('record Fribb -> voce della lista (funzione pura)', () => {
    test('id Kitsu doppiato: la voce porta il badge', () => {
        expect(dumpListAnime.recordToEntry({ kitsu_id: 48269, themoviedb_id: { tv: 1399 } }, true))
            .toEqual({ erdbId: 'kitsu:48269', badge: 'ITA' });
    });

    test('id Kitsu non doppiato: il campo badge non esiste proprio', () => {
        for (const doppiato of [false, null, undefined]) {
            const entry = dumpListAnime.recordToEntry({ kitsu_id: 48270, themoviedb_id: { tv: 1400 } }, doppiato);
            expect(entry).toEqual({ erdbId: 'kitsu:48270' });
            expect('badge' in entry).toBe(false);
            expect(JSON.parse(dumpListAnime.entryToLine(entry))).toEqual({ erdbId: 'kitsu:48270' });
        }
    });

    test('record senza id TMDB: salta, e il motivo e\' "senza id TMDB"', () => {
        expect(dumpListAnime.recordToEntry({ kitsu_id: 11619, themoviedb_id: null }, false))
            .toEqual({ motivo: dumpListAnime.MOTIVI_SALTO.senzaTmdbId });
        expect(dumpListAnime.recordToEntry({ kitsu_id: 11620 }, false))
            .toEqual({ motivo: dumpListAnime.MOTIVI_SALTO.senzaTmdbId });
        // Un id TMDB non numerico non serve a nulla: il record non e\' in catalogo.
        expect(dumpListAnime.recordToEntry({ kitsu_id: 11621, themoviedb_id: { tv: null } }, false))
            .toEqual({ motivo: dumpListAnime.MOTIVI_SALTO.senzaTmdbId });
    });

    test('kitsu_id mancante o non valido: salta, e non diventa mai kitsu:undefined', () => {
        const atteso = { motivo: dumpListAnime.MOTIVI_SALTO.senzaKitsuId };
        for (const record of [
            { themoviedb_id: { tv: 1399 } },
            { kitsu_id: null, themoviedb_id: { tv: 1399 } },
            { kitsu_id: undefined, themoviedb_id: { tv: 1399 } },
            { kitsu_id: '', themoviedb_id: { tv: 1399 } },
            { kitsu_id: 'n/a', themoviedb_id: { tv: 1399 } },
            { kitsu_id: -1, themoviedb_id: { tv: 1399 } },
            null
        ]) {
            expect(dumpListAnime.recordToEntry(record, false)).toEqual(atteso);
        }
    });

    test('entryToLine: una riga JSONL per voce, niente spazi superflui', () => {
        expect(dumpListAnime.entryToLine({ erdbId: 'kitsu:48269', badge: 'ITA' }))
            .toBe('{"erdbId":"kitsu:48269","badge":"ITA"}\n');
        expect(dumpListAnime.entryToLine({ erdbId: 'kitsu:48270' }))
            .toBe('{"erdbId":"kitsu:48270"}\n');
    });

    test('buildSummary: i titoli si contano, i saltati si raggruppano per motivo', () => {
        expect(dumpListAnime.buildSummary({
            totale: 10,
            conBadge: 4,
            saltati: [
                { motivo: dumpListAnime.MOTIVI_SALTO.senzaTmdbId },
                { motivo: dumpListAnime.MOTIVI_SALTO.senzaKitsuId },
                { motivo: dumpListAnime.MOTIVI_SALTO.senzaKitsuId }
            ]
        })).toEqual({
            totale: 10,
            conBadge: 4,
            senzaBadge: 6,
            saltati: 3,
            motivi: {
                [dumpListAnime.MOTIVI_SALTO.senzaKitsuId]: 2,
                [dumpListAnime.MOTIVI_SALTO.senzaTmdbId]: 1
            }
        });
    });
});

describe('lettura degli id (funzione pura)', () => {
    test('kitsu_id numerico, stringa numerica, spazi: tutti utilizzabili', () => {
        expect(dumpListAnime.parseKitsuId(48269)).toBe('48269');
        expect(dumpListAnime.parseKitsuId('48269')).toBe('48269');
        expect(dumpListAnime.parseKitsuId(' 48269 ')).toBe('48269');
    });

    test('kitsu_id sporco: rifiutato (non deve diventare kitsu:NaN)', () => {
        for (const value of [null, undefined, '', '   ', 'n/a', 'kitsu:1', {}, [], true, 0, -5, 1.5]) {
            expect(dumpListAnime.parseKitsuId(value)).toBeNull();
        }
    });

    test('themoviedb_id.movie sull\'indice reale e\' un array: si restituiscono tutti gli id', () => {
        expect(dumpListAnime.parseTmdbIds([999005])).toEqual(['999005']);
        expect(dumpListAnime.parseTmdbIds([128, 1390599])).toEqual(['128', '1390599']);
        expect(dumpListAnime.parseTmdbIds([null, 128, 'nope', 0])).toEqual(['128']);
        expect(dumpListAnime.parseTmdbIds(128)).toEqual(['128']);
        expect(dumpListAnime.parseTmdbIds(null)).toEqual([]);
    });

    test('tmdbTargets: ogni id con la sua fonte (tv -> tv.parquet, movie -> movies.parquet)', () => {
        expect(dumpListAnime.tmdbTargets({ kitsu_id: 1, themoviedb_id: { tv: 26209 } }))
            .toEqual([{ id: '26209', tipo: 'tv' }]);
        expect(dumpListAnime.tmdbTargets({ kitsu_id: 1, themoviedb_id: { movie: [128, 129] } }))
            .toEqual([{ id: '128', tipo: 'movie' }, { id: '129', tipo: 'movie' }]);
        expect(dumpListAnime.tmdbTargets({ kitsu_id: 1, themoviedb_id: { tv: 1, movie: [2] } }))
            .toEqual([{ id: '1', tipo: 'tv' }, { id: '2', tipo: 'movie' }]);
    });

    test('tmdbTargets: un id secco viene cercato in entrambi i parquet', () => {
        expect(dumpListAnime.tmdbTargets({ kitsu_id: 1, themoviedb_id: 77777 }))
            .toEqual([{ id: '77777', tipo: 'movie' }, { id: '77777', tipo: 'tv' }]);
    });

    test('tmdbTargets: nessun id utilizzabile -> lista vuota (il record va saltato)', () => {
        for (const record of [
            { kitsu_id: 1, themoviedb_id: null },
            { kitsu_id: 1 },
            { kitsu_id: 1, themoviedb_id: {} },
            { kitsu_id: 1, themoviedb_id: { tv: null, movie: [] } },
            null
        ]) {
            expect(dumpListAnime.tmdbTargets(record)).toEqual([]);
        }
    });
});

describe('Fribb + parquet -> lista (CLI, processo separato)', () => {
    let dataDir;

    beforeEach(() => {
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-erdb-anime-'));
    });

    afterEach(() => {
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    test('una riga per anime con id TMDB, badge solo dove il catalogo dice "doppiato"', () => {
        makeFixtures(dataDir);
        const out = path.join(dataDir, 'anime.jsonl');
        const result = runDump(['--fribb', makeFribb(dataDir), '--parquet', dataDir, '--out', out]);
        expect(result.status).toBe(0);

        expect(readList(out)).toEqual([
            { erdbId: 'kitsu:48269', badge: 'ITA' },   // tv 1399, ita true
            { erdbId: 'kitsu:48270' },                // tv 1400, ita null
            { erdbId: 'kitsu:11614', badge: 'ITA' },   // film 240411, ita true
            { erdbId: 'kitsu:11615', badge: 'ITA' },   // film 999005 (array), ita true
            { erdbId: 'kitsu:11616' },                 // film 999006/240412, ita false
            { erdbId: 'kitsu:11617' },                 // tv 777777, assente dal catalogo
            { erdbId: 'kitsu:11618', badge: 'ITA' }    // 777777 assente, 999005 doppiato
        ]);

        expect(result.stdout).toMatch(/7 anime in lista/);
        expect(result.stdout).toMatch(/con badge ITA: 4/);
        expect(result.stdout).toMatch(/senza badge: 3/);
        expect(result.stdout).toMatch(/saltati: 7/);
        expect(result.stdout).toMatch(/senza id TMDB: 3/);
        expect(result.stdout).toMatch(/senza kitsu_id: 4/);
    });

    test('la lista prodotta si lascia rileggere da build.js', () => {
        const build = require('../scripts/erdb-builder/build');
        makeFixtures(dataDir);
        const out = path.join(dataDir, 'anime.jsonl');
        expect(runDump(['--fribb', makeFribb(dataDir), '--parquet', dataDir, '--out', out]).status).toBe(0);

        const { entries, errors } = build.parseJsonl(fs.readFileSync(out, 'utf8'));
        expect(errors).toEqual([]);
        expect(entries[0]).toEqual({ erdbId: 'kitsu:48269', badge: 'ITA' });
        expect(entries[1]).toEqual({ erdbId: 'kitsu:48270', badge: '' });
        expect(build.posterFileName(entries[0])).toBe('kitsu-48269_ITA.jpg');
        expect(build.posterFileName(entries[1])).toBe('kitsu-48270.jpg');
    });

    test('nessun file a meta\': l\'indice si scrive su .tmp e compare solo alla fine', () => {
        makeFixtures(dataDir);
        const out = path.join(dataDir, 'anime.jsonl');
        expect(runDump(['--fribb', makeFribb(dataDir), '--parquet', dataDir, '--out', out]).status).toBe(0);
        expect(fs.existsSync(out)).toBe(true);
        expect(fs.existsSync(`${out}.tmp`)).toBe(false);
    });

    test('un giro che fallisce a meta\' non lascia ne\' il file ne\' il .tmp', () => {
        makeFixtures(dataDir);
        const fribb = makeFribb(dataDir);
        // Parquet non valido: il giro parte e muore dentro, non prima.
        fs.writeFileSync(path.join(dataDir, 'tv.parquet'), 'non e\' un parquet', 'utf8');
        const out = path.join(dataDir, 'anime.jsonl');

        const result = runDump(['--fribb', fribb, '--parquet', dataDir, '--out', out]);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/Errore/);
        expect(fs.existsSync(out)).toBe(false);
        expect(fs.existsSync(`${out}.tmp`)).toBe(false);
    });

    test('senza --fribb e senza --out lo script non parte', () => {
        const result = runDump(['--parquet', dataDir]);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/--fribb/);

        const senzaOut = runDump(['--fribb', path.join(dataDir, 'x.json'), '--parquet', dataDir]);
        expect(senzaOut.status).toBe(1);
        expect(senzaOut.stderr).toMatch(/--out/);
    });

    test('indice Fribb assente, rotto o non valido: errore che dice cosa non torna', () => {
        const out = path.join(dataDir, 'anime.jsonl');
        const assente = runDump(['--fribb', path.join(dataDir, 'non-esiste.json'), '--out', out]);
        expect(assente.status).toBe(1);
        expect(assente.stderr).toMatch(/non trovato/);

        const rotto = path.join(dataDir, 'rotto.json');
        fs.writeFileSync(rotto, 'mezzo json', 'utf8');
        const nonJson = runDump(['--fribb', rotto, '--out', out]);
        expect(nonJson.status).toBe(1);
        expect(nonJson.stderr).toMatch(/non e' JSON valido/);

        fs.writeFileSync(rotto, '{"kitsu_id": 1}', 'utf8');
        const nonArray = runDump(['--fribb', rotto, '--out', out]);
        expect(nonArray.status).toBe(1);
        expect(nonArray.stderr).toMatch(/non e' un array/);
    });

    test('cartella senza parquet: errore che dice cosa manca', () => {
        const result = runDump(['--fribb', makeFribb(dataDir), '--parquet', dataDir, '--out', path.join(dataDir, 'anime.jsonl')]);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/movies\.parquet, tv\.parquet/);
        expect(fs.existsSync(path.join(dataDir, 'anime.jsonl'))).toBe(false);
    });

    test('un indice vuoto produce una lista vuota e un riepilogo tutto zero', () => {
        makeFixtures(dataDir);
        const out = path.join(dataDir, 'vuota.jsonl');
        const result = runDump(['--fribb', makeFribb(dataDir, []), '--parquet', dataDir, '--out', out]);

        expect(result.status).toBe(0);
        expect(fs.readFileSync(out, 'utf8')).toBe('');
        expect(result.stdout).toMatch(/0 anime in lista/);
    });
});

describe('argomenti CLI', () => {
    test('default e forma --flag valore / --flag=valore', () => {
        expect(dumpListAnime.parseArgs(['--fribb', 'a.json', '--out', 'b.jsonl']))
            .toEqual({ fribb: 'a.json', parquet: dumpListAnime.DEFAULT_PARQUET_DIR, out: 'b.jsonl', help: false });
        expect(dumpListAnime.parseArgs(['--fribb=a.json', '--parquet=/data/x', '--out=b.jsonl']).parquet).toBe('/data/x');
        expect(dumpListAnime.parseArgs(['--help']).help).toBe(true);
        expect(() => dumpListAnime.parseArgs(['--fribb'])).toThrow(/Manca il valore/);
        expect(() => dumpListAnime.parseArgs(['--boh', 'x'])).toThrow(/Argomento sconosciuto/);
    });

    test('--help spiega da dove arriva il badge', () => {
        expect(dumpListAnime.HELP).toMatch(/ita/i);
        expect(dumpListAnime.DEFAULT_PARQUET_DIR).toBe('/data/tmdb');
        expect(dumpListAnime.BADGE_ITA).toBe('ITA');
    });

    test('la funzione che scrive rifiuta di partire senza i suoi due file', async () => {
        await expect(dumpListAnime.dump({ out: 'x.jsonl' })).rejects.toThrow(/--fribb/);
        await expect(dumpListAnime.dump({ fribb: 'x.json' })).rejects.toThrow(/--out/);
    });
});