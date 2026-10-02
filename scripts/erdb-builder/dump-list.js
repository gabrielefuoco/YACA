#!/usr/bin/env node
/**
 * Genera la lista JSONL dei poster da costruire, leggendo i parquet del catalogo.
 *
 * E' il pezzo che mancava a `build.js`: quello scarica i poster, questo dice *quali*
 * scaricare. Il formato e' quello che build.js si aspetta gia', una riga per titolo:
 *   {"erdbId":"tmdb:movie:27205","badge":"ITA"}
 * Il campo `badge` si omette quando non c'e' niente da metterci: build.js scarica
 * il poster liscio.
 *
 * Uso:
 *   node scripts/erdb-builder/dump-list.js --parquet /data/tmdb --out titoli.jsonl
 *
 * Opzioni:
 *   --parquet <dir>   cartella con movies.parquet e tv.parquet (default /data/tmdb)
 *   --out <file>      lista JSONL da scrivere (obbligatoria)
 *   --help            questo messaggio
 *
 * Le regole dell'`erdbId` NON stanno qui: le produce `getErdbId` dell'app, lo stesso
 * usato dal formatter Stremio quando costruisce l'URL del poster. Se le regole
 * cambiassero, questa lista continuerebbe a essere giusta senza toccare nulla.
 */

const fs = require('fs');
const path = require('path');
const duckdb = require('duckdb');

const { getErdbId } = require('../../src/catalog/formatters/StremioFormatter');

const DEFAULT_PARQUET_DIR = '/data/tmdb';
const BADGE_ITA = 'ITA';

// Le due fonti del catalogo, con il `type` che l'app assegna all'item (Ducking: DuckDbProvider
// costruisce `type: 'movie' | 'series'` e da li' getErdbId deriva `tmdb:movie` / `tmdb:tv`).
const SOURCES = [
    { file: 'movies.parquet', type: 'movie' },
    { file: 'tv.parquet', type: 'series' }
];

// ---------------------------------------------------------------------------
// Funzioni pure (testabili senza DuckDB e senza filesystem)
// ---------------------------------------------------------------------------

/** Path pronto per una stringa SQL: i backslash diventano slash, l'apostrofo raddoppia. */
function toSqlPath(filePath) {
    return `'${String(filePath).replace(/\\/g, '/').replace(/'/g, "''")}'`;
}

/**
 * L'oggetto item che l'app passa al formatter, costruito come lo costruisce
 * `DuckDbProvider` a partire da una riga del parquet: `id` con prefisso `tmdb:` e
 * `type` `movie`/`series`. Solo di questi due campi `getErdbId` ha bisogno.
 */
function toCatalogItem(row, itemType) {
    return { id: `tmdb:${row.id}`, type: itemType };
}

/**
 * Una riga del parquet -> una voce della lista.
 * Il badge c'e' solo se `ita === true`: con `false` o `null` il campo si omette
 * (niente chiave vuota nella lista, niente `?badge=` nell'URL).
 */
function rowToEntry(row, itemType) {
    // Controllo l'id grezzo *prima* di getErdbId: una riga senza id produrrebbe
    // "tmdb:undefined", che sembrebbe un erdbId valido.
    if (!row || row.id === undefined || row.id === null || String(row.id).trim() === '') {
        throw new Error(`riga senza id utilizzabile (id: ${row && row.id})`);
    }
    const erdbId = getErdbId(toCatalogItem(row, itemType));
    if (!erdbId) {
        throw new Error(`riga senza id utilizzabile (id: ${String(row.id)})`);
    }
    const entry = { erdbId };
    if (row.ita === true) entry.badge = BADGE_ITA;
    return entry;
}

/** Una voce -> la sua riga JSONL. */
function entryToLine(entry) {
    return `${JSON.stringify(entry)}\n`;
}

/** Il riepilogo finale: quanti titoli, quanti col badge, quanti senza. */
function buildSummary({ totale, conBadge, saltati }) {
    return {
        totale,
        conBadge,
        senzaBadge: totale - conBadge,
        saltati
    };
}

// ---------------------------------------------------------------------------
// Lettura dei parquet
// ---------------------------------------------------------------------------

function all(con, sql) {
    return new Promise((resolve, reject) => {
        con.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
    });
}

/** La colonna `ita` c'e' solo se il dump l'ha introdotta: se manca, nessun badge. */
async function hasItaColumn(con, parquetFile) {
    const columns = await all(con, `DESCRIBE SELECT * FROM read_parquet(${toSqlPath(parquetFile)})`);
    return columns.some((column) => column.column_name === 'ita');
}

/**
 * Proiezione minima: `id` e basta (piu' `ita` se la colonna esiste).
 * `ORDER BY id` rende la lista deterministica: due dump della stessa cartella
 * producono lo stesso file, quindi un diff tra due giri si legge.
 */
function buildSelect(parquetFile, { withIta }) {
    const columns = ['CAST(id AS BIGINT) AS id'];
    if (withIta) columns.push('CAST(ita AS BOOLEAN) AS ita');
    return `SELECT ${columns.join(', ')}
            FROM read_parquet(${toSqlPath(parquetFile)})
            WHERE id IS NOT NULL
            ORDER BY id`;
}

function closeDatabase(con, db) {
    return new Promise((resolve) => {
        if (con) {
            con.close(() => (db ? db.close(() => resolve()) : resolve()));
            return;
        }
        if (db) db.close(() => resolve());
        else resolve();
    });
}

/** Scrive una riga rispettando la backpressure dello stream. */
function writeLine(stream, line) {
    if (stream.write(line)) return null;
    return new Promise((resolve, reject) => {
        stream.once('drain', resolve);
        stream.once('error', reject);
    });
}

function closeStream(stream) {
    return new Promise((resolve, reject) => {
        stream.once('error', reject);
        stream.end(resolve);
    });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS = {
    parquet: DEFAULT_PARQUET_DIR,
    out: null,
    help: false
};

/** Parsing degli argomenti CLI. Supporta sia `--flag valore` sia `--flag=valore`. */
function parseArgs(argv = []) {
    const options = { ...DEFAULT_OPTIONS };

    const readValue = (flag, inline, indexRef) => {
        if (inline !== null) return inline;
        const value = argv[indexRef.value + 1];
        if (value === undefined) throw new Error(`Manca il valore di ${flag}`);
        indexRef.value += 1;
        return value;
    };

    const indexRef = { value: 0 };
    for (; indexRef.value < argv.length; indexRef.value++) {
        const arg = argv[indexRef.value];
        if (!arg.startsWith('-')) throw new Error(`Argomento sconosciuto: ${arg}`);

        const eq = arg.indexOf('=');
        const flag = eq === -1 ? arg : arg.slice(0, eq);
        const inline = eq === -1 ? null : arg.slice(eq + 1);

        switch (flag) {
            case '--parquet': options.parquet = readValue(flag, inline, indexRef); break;
            case '--out': options.out = readValue(flag, inline, indexRef); break;
            case '--help':
            case '-h': options.help = true; break;
            default: throw new Error(`Argomento sconosciuto: ${flag}`);
        }
    }

    return options;
}

const HELP = [
    'Genera la lista JSONL dei poster da costruire, leggendo i parquet del catalogo.',
    '',
    `  --parquet <dir>   cartella con movies.parquet e tv.parquet (default ${DEFAULT_PARQUET_DIR})`,
    '  --out <file>      lista JSONL da scrivere, obbligatoria',
    '  --help            questo messaggio',
    '',
    "L'erdbId lo produce l'app (getErdbId nel formatter Stremio), non questo script."
].join('\n');

function printSummary(summary) {
    console.log(`Fatto: ${summary.totale.toLocaleString('it-IT')} titoli in lista`);
    console.log(`  con badge ${BADGE_ITA}: ${summary.conBadge.toLocaleString('it-IT')}`);
    console.log(`  senza badge: ${summary.senzaBadge.toLocaleString('it-IT')}`);
    if (summary.saltati > 0) {
        console.log(`  righe scartate (id mancante): ${summary.saltati.toLocaleString('it-IT')}`);
    }
}

// ---------------------------------------------------------------------------
// Logica con I/O
// ---------------------------------------------------------------------------

/**
 * Scrive la lista JSONL di tutti i titoli presenti nei parquet.
 * Opzioni: { parquetDir, out }
 * Ritorna il riepilogo { totale, conBadge, senzaBadge, saltati }.
 */
async function dump({ parquetDir = DEFAULT_PARQUET_DIR, out } = {}) {
    if (!out) throw new Error('Manca --out: serve il file JSONL da scrivere');

    const resolvedDir = path.resolve(parquetDir);
    const resolvedOut = path.resolve(out);
    const tmpOut = `${resolvedOut}.tmp`;

    const mancanti = SOURCES
        .map((source) => source.file)
        .filter((file) => !fs.existsSync(path.join(resolvedDir, file)));
    if (mancanti.length) {
        throw new Error(`Parquet non trovati in ${resolvedDir}: ${mancanti.join(', ')}`);
    }

    const conteggio = { totale: 0, conBadge: 0, saltati: 0 };
    const db = new duckdb.Database(':memory:');
    const con = db.connect();
    const stream = fs.createWriteStream(tmpOut, { encoding: 'utf8' });

    try {
        for (const source of SOURCES) {
            const parquetFile = path.join(resolvedDir, source.file);
            const withIta = await hasItaColumn(con, parquetFile);
            if (!withIta) {
                console.warn(`Attenzione: ${source.file} non ha la colonna "ita": in lista senza badge.`);
            }

            for await (const row of con.stream(buildSelect(parquetFile, { withIta }))) {
                let entry;
                try {
                    entry = rowToEntry(row, source.type);
                } catch (_) {
                    conteggio.saltati += 1;
                    continue;
                }
                if (entry.badge) conteggio.conBadge += 1;
                conteggio.totale += 1;
                const backpressure = writeLine(stream, entryToLine(entry));
                if (backpressure) await backpressure;
            }
        }
        await closeStream(stream);
    } catch (error) {
        stream.destroy();
        fs.promises.unlink(tmpOut).catch(() => {});
        await closeDatabase(con, db).catch(() => {});
        throw error;
    }
    await closeDatabase(con, db);

    // Il file finale compare tutto o niente: un giro interrotto non lascia mezzo elenco.
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    await fs.promises.rename(tmpOut, resolvedOut);

    return buildSummary(conteggio);
}

async function main(argv = process.argv.slice(2)) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (err) {
        console.error(`${err.message}\n\n${HELP}`);
        process.exitCode = 1;
        return null;
    }

    if (options.help) {
        console.log(HELP);
        return null;
    }

    try {
        const summary = await dump({ parquetDir: options.parquet, out: options.out });
        printSummary(summary);
        return summary;
    } catch (error) {
        console.error(`Errore: ${error.message}`);
        process.exitCode = 1;
        return null;
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_PARQUET_DIR,
    BADGE_ITA,
    SOURCES,
    HELP,
    // Riesportata di proposito: dal test si vede che la lista usa la funzione dell'app.
    getErdbId,
    toSqlPath,
    toCatalogItem,
    rowToEntry,
    entryToLine,
    buildSummary,
    buildSelect,
    parseArgs,
    dump,
    main
};