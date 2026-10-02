#!/usr/bin/env node
/**
 * Genera la lista JSONL dei poster degli ANIME da costruire, leggendo l'indice Fribb.
 *
 * E' il fratello di `dump-list.js`, che fa lo stesso per film e serie dai parquet. La
 * differenza e' da dove arrivano gli id: gli anime hanno un id proprio, `kitsu:<numero>`,
 * e vivono in un indice esterno (Fribb `anime-list-mini`) invece che nei parquet del catalogo.
 * Il formato e' identico, perche' e' sempre `build.js` a leggerlo:
 *   {"erdbId":"kitsu:12345","badge":"ITA"}
 * Il campo `badge` si omette quando non c'e' niente da metterci.
 *
 * Il badge si decide incrociando l'id TMDB dell'anime con i parquet del catalogo: e' l'unico
 * posto dove sappiamo se un anime e' doppiato. Attenzione alla forma di `themoviedb_id` sull'indice
 * reale: e' un oggetto `{tv, movie}`, ma `movie` e' un ARRAY di id (un'opera puo' avere piu' film
 * su TMDB) mentre `tv` e' un numero. Se un record porta piu' film, basta che uno sia doppiato.
 *
 * Uso:
 *   node scripts/erdb-builder/dump-list-anime.js --fribb fribb-mini.json --out anime.jsonl
 *
 * Opzioni:
 *   --fribb <file>     indice Fribb anime-list-mini.json, array JSON di record (obbligatoria)
 *   --parquet <dir>    cartella con movies.parquet e tv.parquet (default /data/tmdb)
 *   --out <file>       lista JSONL da scrivere (obbligatoria)
 *   --help             questo messaggio
 *
 * I titoli non si arricchiscono: al costruttore serve solo `{erdbId, badge}`, il poster lo
 * trova ERDB dall'id Kitsu. I record senza id TMDB vengono saltati: se non sono nel catalogo
 * non sappiamo dire se sono doppiati, e listarli significherebbe scaricare due volte la stessa
 * copertina (una dal ramo TMDB, una dal ramo Kitsu).
 */

const fs = require('fs');
const path = require('path');
const duckdb = require('duckdb');

const DEFAULT_PARQUET_DIR = '/data/tmdb';
const BADGE_ITA = 'ITA';

// Gli id TMDB si cercano dove li cerca `dump-list.js`: `movies.parquet` per i film,
// `tv.parquet` per le serie. Quando l'indice Fribb non dice quale dei due sia, si cercano
// entrambi e il badge e' vero solo se almeno uno dei due lo dice.
const SOURCES = [
    { file: 'movies.parquet', tipo: 'movie' },
    { file: 'tv.parquet', tipo: 'tv' }
];

// Motivi di salto: il riepilogo finale li conta uno per uno, cosi' si sa *perche'* mancano
// dei titoli e non solo quanti.
const MOTIVI_SALTO = {
    senzaKitsuId: 'senza kitsu_id',
    senzaTmdbId: 'senza id TMDB'
};

// ---------------------------------------------------------------------------
// Funzioni pure (testabili senza DuckDB e senza filesystem)
// ---------------------------------------------------------------------------

/** Path pronto per una stringa SQL: i backslash diventano slash, l'apostrofo raddoppia. */
function toSqlPath(filePath) {
    return `'${String(filePath).replace(/\\/g, '/').replace(/'/g, "''")}'`;
}

/**
 * Un id Kitsu utilizzabile: numero intero positivo, o stringa che contiene solo cifre.
 * Restituisce la stringa pulita, oppure `null` se non e' un id (assente, oggetto, vuoto, "n/a").
 * Serve perche' sull'indice reale i campi mancanti arrivano come `null`, ma un dato sporco
 * non deve mai diventare `kitsu:undefined`, che sembrerebbe un id valido.
 */
function parseKitsuId(value) {
    if (value === undefined || value === null || typeof value === 'object' || typeof value === 'boolean') return null;
    const testo = String(value).trim();
    if (!/^\d+$/.test(testo)) return null;
    const numero = Number(testo);
    return Number.isSafeInteger(numero) && numero > 0 ? testo : null;
}

/** Come `parseKitsuId`, ma accetta anche un ARRAY di id e ne restituisce tutti quanti. */
function parseTmdbIds(value) {
    const candidati = Array.isArray(value) ? value : [value];
    const ids = [];
    for (const candidato of candidati) {
        const id = parseKitsuId(candidato);
        if (id) ids.push(id);
    }
    return ids;
}

/**
 * Il record Fribb -> gli id TMDB su cui cercare il doppiaggio, con la fonte da cui cercarlo.
 * `themoviedb_id` e' di solito `{tv, movie}`, ma sull'indice reale i due campi non hanno la
 * stessa forma: `tv` e' un numero, `movie` e' un ARRAY di numeri (un'opera puo' avere piu'
 * film su TMDB). Per questo `parseTmdbIds` restituisce una lista. Inoltre l'indice puo' dare
 * un numero secco, quando non distingue: allora si cerca in entrambi i parquet, perche' non si
 * sa se sia un film o una serie (un id non presente nell'altro da' comunque "non doppiato").
 * Se non c'e' nessun id TMDB utilizzabile la lista e' vuota: il record va saltato.
 */
function tmdbTargets(record) {
    const raw = record && record.themoviedb_id;
    if (raw === undefined || raw === null) return [];

    if (typeof raw !== 'object' || Array.isArray(raw)) {
        const targets = [];
        for (const id of parseTmdbIds(raw)) {
            for (const source of SOURCES) targets.push({ id, tipo: source.tipo });
        }
        return targets;
    }

    const targets = [];
    for (const id of parseTmdbIds(raw.tv)) targets.push({ id, tipo: 'tv' });
    for (const id of parseTmdbIds(raw.movie)) targets.push({ id, tipo: 'movie' });
    return targets;
}

/**
 * Un record Fribb -> la voce della lista, oppure l'oggetto `{ motivo }` che dice perche' salta.
 * `doppiato` arriva gia' risolto dal chiamante (questa funzione non legge i parquet):
 * `true` solo se l'id TMDB del record risulta doppiato nel catalogo.
 * Un record senza id Kitsu o senza id TMDB non diventa mai una voce: la riga `{ motivo }` che
 * esce al posto e' il conto, non un titolo.
 */
function recordToEntry(record, doppiato) {
    const kitsuId = parseKitsuId(record && record.kitsu_id);
    if (!kitsuId) return { motivo: MOTIVI_SALTO.senzaKitsuId };

    const targets = tmdbTargets(record);
    if (!targets.length) return { motivo: MOTIVI_SALTO.senzaTmdbId };

    const entry = { erdbId: `kitsu:${kitsuId}` };
    if (doppiato === true) entry.badge = BADGE_ITA;
    return entry;
}

/** Una voce -> la sua riga JSONL. */
function entryToLine(entry) {
    return `${JSON.stringify(entry)}\n`;
}

/** Il riepilogo finale: quanti titoli, quanti col badge, quanti saltati e perche'. */
function buildSummary({ totale, conBadge, saltati }) {
    const motivi = {};
    for (const motivo of Object.values(MOTIVI_SALTO)) motivi[motivo] = 0;
    for (const record of saltati) {
        const motivo = record && record.motivo ? record.motivo : 'motivo sconosciuto';
        motivi[motivo] = (motivi[motivo] || 0) + 1;
    }
    return {
        totale,
        conBadge,
        senzaBadge: totale - conBadge,
        saltati: saltati.length,
        motivi
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

/** Path pronto per DuckDB: i backslash (Windows) diventano slash. */
function toParquetPath(dir, file) {
    return path.join(dir, file).replace(/\\/g, '/');
}

/**
 * Carica in memoria gli id TMDB doppiati di una sorgente: `Set` di stringhe.
 * Solo i `ita === true` entrano nel Set, quindi l'assenza significa "non doppiato": non serve
 * tenere in memoria gli altri milioni di titoli, e la risposta e' la stessa.
 */
async function loadDubbedIds(con, dir, { file, tipo }) {
    const parquetFile = toParquetPath(dir, file);
    if (!fs.existsSync(parquetFile)) throw new Error(`Parquet non trovato: ${parquetFile}`);

    if (!await hasItaColumn(con, parquetFile)) {
        console.warn(`Attenzione: ${file} non ha la colonna "ita": nessun badge da questa fonte.`);
        return { tipo, ids: new Set() };
    }

    const ids = new Set();
    const sql = `SELECT CAST(id AS VARCHAR) AS id
                 FROM read_parquet('${parquetFile}')
                 WHERE id IS NOT NULL AND ita`;
    for await (const row of con.stream(sql)) ids.add(String(row.id));
    return { tipo, ids };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS = {
    fribb: null,
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
            case '--fribb': options.fribb = readValue(flag, inline, indexRef); break;
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
    'Genera la lista JSONL dei poster degli anime da costruire, leggendo l\'indice Fribb.',
    '',
    '  --fribb <file>      indice Fribb anime-list-mini.json (obbligatoria)',
    `  --parquet <dir>     cartella con movies.parquet e tv.parquet (default ${DEFAULT_PARQUET_DIR})`,
    '  --out <file>        lista JSONL da scrivere (obbligatoria)',
    '  --help              questo messaggio',
    '',
    "Il badge ITA si decide incrociando l'id TMDB dell'anime con i parquet del catalogo."
].join('\n');

function printSummary(summary) {
    console.log(`Fatto: ${summary.totale.toLocaleString('it-IT')} anime in lista`);
    console.log(`  con badge ${BADGE_ITA}: ${summary.conBadge.toLocaleString('it-IT')}`);
    console.log(`  senza badge: ${summary.senzaBadge.toLocaleString('it-IT')}`);
    if (summary.saltati > 0) {
        console.log(`  saltati: ${summary.saltati.toLocaleString('it-IT')}`);
        for (const [motivo, numero] of Object.entries(summary.motivi)) {
            if (numero > 0) console.log(`    ${motivo}: ${numero.toLocaleString('it-IT')}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Logica con I/O
// ---------------------------------------------------------------------------

/**
 * Scrive la lista JSONL degli anime che hanno sia un id Kitsu sia un id TMDB, nell'ordine in
 * cui compaiono nell'indice (nessun riordino: l'indice e' gia' stabile tra due scaricamenti).
 * Opzioni: { fribb, parquetDir, out }
 * Ritorna il riepilogo { totale, conBadge, senzaBadge, saltati, motivi }.
 */
async function dump({ fribb, parquetDir = DEFAULT_PARQUET_DIR, out } = {}) {
    if (!fribb) throw new Error('Manca --fribb: serve l\'indice anime-list-mini.json');
    if (!out) throw new Error('Manca --out: serve il file JSONL da scrivere');

    const resolvedFribb = path.resolve(fribb);
    const resolvedDir = path.resolve(parquetDir);
    const resolvedOut = path.resolve(out);
    const tmpOut = `${resolvedOut}.tmp`;

    if (!fs.existsSync(resolvedFribb)) throw new Error(`Indice Fribb non trovato: ${resolvedFribb}`);

    // L'indice si legge e si valida per primo: se e' sbagliato (o non e' un array), inutile
    // anche accendere DuckDB. Sono ~40k record, 6 MB: si legge tutto in memoria.
    let records;
    try {
        records = JSON.parse(fs.readFileSync(resolvedFribb, 'utf8'));
    } catch (err) {
        throw new Error(`L'indice Fribb non e' JSON valido: ${err.message}`, { cause: err });
    }
    if (!Array.isArray(records)) throw new Error(`L'indice Fribb non e' un array JSON: ${resolvedFribb}`);

    const mancanti = SOURCES
        .map((source) => source.file)
        .filter((file) => !fs.existsSync(path.join(resolvedDir, file)));
    if (mancanti.length) {
        throw new Error(`Parquet non trovati in ${resolvedDir}: ${mancanti.join(', ')}`);
    }

    const conteggio = { totale: 0, conBadge: 0, saltati: [] };
    const db = new duckdb.Database(':memory:');
    const con = db.connect();

    // Due Set di id doppiati (movie e tv): il badge si decide con una membership, non con una
    // query per ogni record. 39.577 record anime contro milioni di righe di catalogo: senza
    // questo, ogni giro costerebbe decine di migliaia di query.
    const doppiati = {};
    try {
        for (const source of SOURCES) {
            const { tipo, ids } = await loadDubbedIds(con, resolvedDir, source);
            doppiati[tipo] = ids;
        }

        // Una voce per record: gli id Kitsu si ripetono (stesso anime, piu' stagioni)? No: ogni
        // record e' una stagione con il suo Kitsu id. Se pero' lo stesso id compare due volte,
        // `seen` tiene la prima: la lista resta senza duplicati, che per `build.js` sono
        // richieste inutili identiche.
        const seen = new Set();
        const stream = fs.createWriteStream(tmpOut, { encoding: 'utf8' });
        // Un solo listener per gli errori della scrittura, per tutta la durata del giro: qui si
        // aggiungerebbe un listener a ogni strozzatura della write stream e Node lo segnalerebbe
        // come leak (sulla lista vera, che ha ~40k righe, l'avrebbe segnalato da subito).
        const streamError = new Promise((_, reject) => stream.once('error', reject));
        streamError.catch(() => {}); // rifiuta sempre: l'attesa arriva dai `Promise.race` sotto
        const attendeSvuoto = () => new Promise((resolve) => stream.once('drain', resolve));

        try {
            for (const record of records) {
                // Doppiato = almeno uno degli id TMDB del record e' nella lista dei doppiati.
                // Su un record senza id TMDB `targets` e' vuoto: il risultato e' false, e subito
                // dopo `recordToEntry` lo scarta per il motivo giusto.
                const doppiato = tmdbTargets(record).some((target) => doppiati[target.tipo].has(target.id));
                const entry = recordToEntry(record, doppiato);
                if (entry.motivo) {
                    conteggio.saltati.push(entry);
                    continue;
                }
                if (seen.has(entry.erdbId)) continue;
                seen.add(entry.erdbId);

                conteggio.totale += 1;
                if (entry.badge) conteggio.conBadge += 1;
                if (!stream.write(entryToLine(entry))) {
                    await Promise.race([attendeSvuoto(), streamError]);
                }
            }
            await Promise.race([new Promise((resolve) => stream.end(resolve)), streamError]);
        } catch (error) {
            stream.destroy();
            throw error;
        }
    } catch (error) {
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
        const summary = await dump({ fribb: options.fribb, parquetDir: options.parquet, out: options.out });
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
    MOTIVI_SALTO,
    HELP,
    toSqlPath,
    parseKitsuId,
    parseTmdbIds,
    tmdbTargets,
    recordToEntry,
    entryToLine,
    buildSummary,
    parseArgs,
    dump,
    main
};