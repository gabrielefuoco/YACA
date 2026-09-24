const duckdb = require('duckdb');
const path = require('path');
const fs = require('fs');

const DEFAULT_TYPES = ['movies', 'tv'];

function toSqlPath(filePath) {
    return `'${filePath.replace(/\\/g, '/').replace(/'/g, "''")}'`;
}

function defaultDataDir() {
    if (fs.existsSync('/data')) return '/data/tmdb';
    return path.resolve(__dirname, '../.cache/tmdb');
}

function parseDataDir(argv = process.argv.slice(2), env = process.env) {
    const index = argv.indexOf('--data-dir');
    if (index !== -1) {
        if (!argv[index + 1]) throw new Error('--data-dir richiede un percorso');
        return path.resolve(argv[index + 1]);
    }
    return env.TMDB_DUMP_DIR
        ? path.resolve(env.TMDB_DUMP_DIR)
        : defaultDataDir();
}

function parseTypes(argv) {
    const index = argv.indexOf('--type');
    if (index === -1) return [...DEFAULT_TYPES];
    const value = String(argv[index + 1] || '').toLowerCase();
    if (value === 'movie' || value === 'movies') return ['movies'];
    if (value === 'tv' || value === 'series') return ['tv'];
    if (value === 'all') return [...DEFAULT_TYPES];
    throw new Error(`Tipo non valido: ${value}. Usare movies, tv oppure all.`);
}

function exec(con, sql) {
    return new Promise((resolve, reject) => {
        con.exec(sql, (error) => error ? reject(error) : resolve());
    });
}

function all(con, sql) {
    return new Promise((resolve, reject) => {
        con.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
    });
}

function hasFetchedAtColumn(con, jsonlFile) {
    const source = `read_json_auto(${toSqlPath(jsonlFile)}, ignore_errors=true, union_by_name=true, sample_size=-1)`;
    return all(con, `DESCRIBE SELECT * FROM ${source}`)
        .then((columns) => columns.some((column) => column.column_name === '_fetched_at'));
}

function buildConversionSelect(jsonlFile, includeFetchedAt) {
    // _fetched_at è l'unico segnale temporale affidabile. Se manca, il numero
    // di riga del lettore JSON permette comunque di scegliere l'ultima append.
    // Un timestamp valido ha sempre precedenza rispetto a un record senza data.
    const freshnessOrder = includeFetchedAt
        ? `CASE WHEN try_cast(_fetched_at AS TIMESTAMP) IS NULL THEN 0 ELSE 1 END DESC,
                   try_cast(_fetched_at AS TIMESTAMP) DESC NULLS LAST,
                   __yaca_source_row DESC`
        : '__yaca_source_row DESC';

    return `
        WITH source_rows AS (
            SELECT row_number() OVER () AS __yaca_source_row, *
            FROM read_json_auto(
                ${toSqlPath(jsonlFile)},
                ignore_errors=true,
                union_by_name=true,
                sample_size=-1
            )
        ), ranked AS (
            SELECT *, row_number() OVER (
                PARTITION BY id
                ORDER BY ${freshnessOrder}
            ) AS __yaca_duplicate_rank
            FROM source_rows
        )
        SELECT * EXCLUDE (__yaca_source_row, __yaca_duplicate_rank)
        FROM ranked
        WHERE __yaca_duplicate_rank = 1
        ORDER BY popularity DESC
    `;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function replaceFile(sourceFile, destinationFile, attempts = 12) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            fs.renameSync(sourceFile, destinationFile);
            return;
        } catch (error) {
            lastError = error;
            if (!['EACCES', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
            await wait(Math.min(25 * (2 ** attempt), 500));
        }
    }
    throw lastError;
}

function closeDatabase(con, db) {
    return new Promise((resolve) => {
        if (!con) {
            if (db) db.close(() => resolve());
            else resolve();
            return;
        }
        con.close(() => {
            if (db) db.close(() => resolve());
            else resolve();
        });
    });
}

async function sourceStats(con, jsonlFile) {
    const source = `read_json_auto(${toSqlPath(jsonlFile)}, ignore_errors=true, union_by_name=true, sample_size=-1)`;
    const rows = await all(con, `SELECT COUNT(*) AS row_count, COUNT(DISTINCT id) AS unique_id_count FROM ${source}`);
    return {
        sourceRowCount: Number(rows[0]?.row_count || 0),
        sourceUniqueIdCount: Number(rows[0]?.unique_id_count || 0)
    };
}

async function parquetStats(con, parquetFile) {
    const rows = await all(con, `
        SELECT COUNT(*) AS row_count, COUNT(DISTINCT id) AS unique_id_count
        FROM read_parquet(${toSqlPath(parquetFile)})
    `);
    const rowCount = Number(rows[0]?.row_count || 0);
    const uniqueIdCount = Number(rows[0]?.unique_id_count || 0);
    return {
        rowCount,
        uniqueIdCount
    };
}

async function convert({ dataDir, types = DEFAULT_TYPES } = {}) {
    const resolvedDataDir = path.resolve(dataDir || defaultDataDir());
    const results = [];
    let hasError = false;

    console.log('[DuckDB Convert] Avvio conversione JSONL in Parquet (ZSTD, dedup per id)...');
    console.time('Tempo totale conversione');

    for (const type of types) {
        const jsonlFile = path.join(resolvedDataDir, `master_${type}.jsonl`);
        const parquetFile = path.join(resolvedDataDir, `${type}.parquet`);
        const tmpParquetFile = path.join(resolvedDataDir, `${type}_tmp.parquet`);

        if (!fs.existsSync(jsonlFile)) {
            console.warn(`[DuckDB Convert] JSONL per ${type} non trovato: ${jsonlFile}`);
            results.push({ type, skipped: true, reason: 'missing-jsonl' });
            continue;
        }

        console.log(`[DuckDB Convert] Copia e deduplica di ${type}...`);
        const destinationExisted = fs.existsSync(parquetFile);
        const writerFile = destinationExisted ? tmpParquetFile : parquetFile;
        if (destinationExisted && fs.existsSync(tmpParquetFile)) fs.unlinkSync(tmpParquetFile);

        let con = null;
        let db = null;
        let databaseClosed = false;
        try {
            db = new duckdb.Database(':memory:');
            con = db.connect();
            const includeFetchedAt = await hasFetchedAtColumn(con, jsonlFile);
            const inputStats = await sourceStats(con, jsonlFile);
            const select = buildConversionSelect(jsonlFile, includeFetchedAt);
            const query = `COPY (${select}) TO ${toSqlPath(writerFile)} (FORMAT PARQUET, COMPRESSION 'ZSTD')`;

            await exec(con, query);
            if (!fs.existsSync(writerFile)) throw new Error(`Writer non ha creato ${writerFile}`);

            const stats = await parquetStats(con, writerFile);
            // DuckDB/Windows mantiene il file aperto finché la connessione vive.
            // Chiudere connessione e database prima del rename rende atomico anche l'isolated run.
            await closeDatabase(con, db);
            con = null;
            db = null;
            databaseClosed = true;
            // Quando esiste già un parquet, la sostituzione resta atomica: i
            // lettori vedono il vecchio file oppure il nuovo, mai un file parziale.
            // Al primo avvio non esiste un destinatario, quindi DuckDB scrive
            // direttamente sul nome finale (necessario anche su Windows, dove il
            // modulo nativo può mantenere aperto il writer fino alla fine del processo).
            if (destinationExisted) await replaceFile(tmpParquetFile, parquetFile);
            const sizeBytes = fs.statSync(parquetFile).size;
            const duplicatesRemoved = inputStats.sourceRowCount - stats.uniqueIdCount;
            const result = { type, ...inputStats, ...stats, duplicatesRemoved, sizeBytes, skipped: false };
            results.push(result);
            console.log(
                `[DuckDB Convert] ✅ ${type}.parquet: ${stats.rowCount.toLocaleString('it-IT')} righe, ` +
                `${stats.uniqueIdCount.toLocaleString('it-IT')} id univoci, ` +
                `${duplicatesRemoved.toLocaleString('it-IT')} duplicate rimosse, ` +
                `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`
            );
        } catch (error) {
            if ((con || db) && !databaseClosed) {
                try {
                    await closeDatabase(con, db);
                } catch (_) {
                    // L'errore originale è più informative di un eventuale errore di cleanup.
                }
            }
            console.error(`[DuckDB Convert] ❌ Errore durante conversione ${type}:`, error);
            if (fs.existsSync(writerFile)) {
                try {
                    if (destinationExisted) await replaceFile(writerFile, `${writerFile}.failed`);
                    else fs.unlinkSync(writerFile);
                    if (fs.existsSync(`${writerFile}.failed`)) fs.unlinkSync(`${writerFile}.failed`);
                } catch (_) {
                    // Non mascherare l'errore di conversione con quello di cleanup.
                }
            }
            hasError = true;
            results.push({ type, skipped: false, error: error.message });
        }
    }

    console.timeEnd('Tempo totale conversione');
    return { success: !hasError, dataDir: resolvedDataDir, results };
}

function printHelp() {
    console.log(`Uso: node scripts/convert_to_parquet.js [opzioni]

Opzioni:
  --data-dir <percorso>  Directory di master_*.jsonl e *.parquet
                         (default: /data/tmdb oppure .cache/tmdb)
  --type <tipo>          movies, tv oppure all (default: all)
  -h, --help             Mostra questo messaggio

La selezione per id conserva il _fetched_at più recente; in sua assenza
viene conservata l'ultima occorrenza nel JSONL.`);
}

if (require.main === module) {
    const argv = process.argv.slice(2);
    if (argv.includes('-h') || argv.includes('--help')) {
        printHelp();
    } else {
        try {
            const dataDir = parseDataDir(argv);
            const types = parseTypes(argv);
            convert({ dataDir, types }).then(({ success }) => {
                process.exitCode = success ? 0 : 1;
            }).catch((error) => {
                console.error('[DuckDB Convert] ❌ Errore fatale:', error);
                process.exitCode = 1;
            });
        } catch (error) {
            console.error(`[DuckDB Convert] ❌ ${error.message}`);
            process.exitCode = 1;
        }
    }
}

module.exports = {
    buildConversionSelect,
    convert,
    parseDataDir,
    parseTypes,
    toSqlPath
};
