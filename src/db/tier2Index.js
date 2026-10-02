const duckdb = require('duckdb');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const http = require('http');
const https = require('https');

function defaultDataDir() {
    if (process.env.TMDB_DUMP_DIR) return path.resolve(process.env.TMDB_DUMP_DIR);
    if (fs.existsSync('/data')) return '/data/tmdb';
    return path.resolve(__dirname, '../../.cache/tmdb');
}

function toSqlPath(filePath) {
    return `'${filePath.replace(/\\/g, '/').replace(/'/g, "''")}'`;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function replaceFile(sourceFile, destinationFile, attempts = 15) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            // Su Windows il rename fallisce se la destinazione esiste o se c'è lock transitorio
            if (process.platform === 'win32') {
                fs.copyFileSync(sourceFile, destinationFile);
                try { fs.unlinkSync(sourceFile); } catch (_) {}
                return;
            } else {
                fs.renameSync(sourceFile, destinationFile);
                return;
            }
        } catch (error) {
            lastError = error;
            if (!['EACCES', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
            await wait(Math.min(50 * (2 ** attempt), 1000));
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

function sanitizeFts5Query(input) {
    if (!input || typeof input !== 'string') return '';
    const clean = input
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .trim();
    if (!clean) return '';

    const tokens = clean
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length > 0 && !['AND', 'OR', 'NOT', 'NEAR'].includes(t.toUpperCase()));

    if (tokens.length === 0) return '';

    return tokens.map((token, index) => {
        const escaped = token.replace(/"/g, '""');
        if (index === tokens.length - 1 && escaped.length >= 2) {
            return `"${escaped}"*`;
        }
        return `"${escaped}"`;
    }).join(' ');
}

function downloadTo(url, destination) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            const out = fs.createWriteStream(destination);
            res.pipe(out);
            out.on('finish', () => out.close(() => resolve()));
            out.on('error', reject);
            res.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Scarica il **daily export** di TMDB e ritorna il percorso del `.gz` su disco (null se non riesce).
 *
 * Il file resta su disco: una build successiva nella stessa giornata lo riusa senza riscaricarlo.
 * Si provano gli ultimi giorni perché TMDB pubblica l'export di oggi con qualche ora di ritardo.
 *
 * @param {'movies'|'tv'} mediaType
 * @param {string} dir cartella dove tenere gli export (es. `<data>/export`)
 */
async function fetchDailyExport(mediaType, dir, daysAgoMax = 3) {
    const typeStr = mediaType === 'movies' ? 'movie_ids' : 'tv_series_ids';
    fs.mkdirSync(dir, { recursive: true });

    for (let daysAgo = 0; daysAgo < daysAgoMax; daysAgo++) {
        const dt = new Date();
        dt.setUTCDate(dt.getUTCDate() - daysAgo);
        const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(dt.getUTCDate()).padStart(2, '0');
        const dateStr = `${mm}_${dd}_${dt.getUTCFullYear()}`;
        const file = path.join(dir, `${typeStr}_${dateStr}.json.gz`);
        if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;

        try {
            await downloadTo(`https://files.tmdb.org/p/exports/${typeStr}_${dateStr}.json.gz`, `${file}.part`);
            await replaceFile(`${file}.part`, file);
            return file;
        } catch (_err) {
            try { fs.unlinkSync(`${file}.part`); } catch (_e) {}
        }
    }
    return null;
}

/**
 * La sorgente del Tier 2 è il **daily export**, non il Tier 1.
 *
 * Il Tier 1 è **filtrato** (soglie di visibilità) e contiene solo ciò che abbiamo già: costruire
 * l'indice da lì significa indicizzare il catalogo, mentre il Tier 2 esiste per la **coda lunga** —
 * la ricerca di un titolo che in catalogo non c'è ancora (è ciò che serve alla promozione lazy).
 * L'export è anche l'unica sorgente che si aggiorna **senza una sola chiamata API**.
 *
 * Nota: l'export non porta i titoli localizzati né la data, quindi `title` = titolo originale e
 * `release_date` resta vuota. Con l'export non si può fare di meglio senza pagare chiamate.
 */
function buildExportSelect(moviesExport, tvExport) {
    const parts = [];

    if (moviesExport) {
        parts.push(`
            SELECT
                CAST(id AS BIGINT) AS id,
                'movie' AS type,
                COALESCE(CAST(original_title AS VARCHAR), '') AS title,
                COALESCE(CAST(original_title AS VARCHAR), '') AS original_title,
                COALESCE(CAST(popularity AS DOUBLE), 0.0) AS popularity,
                CAST(NULL AS VARCHAR) AS release_date
            FROM read_json_auto(${toSqlPath(moviesExport)}, ignore_errors=true, sample_size=-1)
            WHERE NOT COALESCE(CAST(adult AS BOOLEAN), false)
        `);
    }

    if (tvExport) {
        parts.push(`
            SELECT
                CAST(id AS BIGINT) AS id,
                'tv' AS type,
                COALESCE(CAST(original_name AS VARCHAR), '') AS title,
                COALESCE(CAST(original_name AS VARCHAR), '') AS original_title,
                COALESCE(CAST(popularity AS DOUBLE), 0.0) AS popularity,
                CAST(NULL AS VARCHAR) AS release_date
            FROM read_json_auto(${toSqlPath(tvExport)}, ignore_errors=true, sample_size=-1)
        `);
    }

    return parts.join('\nUNION ALL\n');
}

function buildUnifiedSelect({ sourceParquet, moviesParquet, tvParquet, moviesJsonl, tvJsonl }) {
    if (sourceParquet) {
        return `
            SELECT 
                CAST(id AS BIGINT) AS id,
                'movie' AS type,
                COALESCE(CAST(title AS VARCHAR), '') AS title,
                COALESCE(CAST(original_title AS VARCHAR), '') AS original_title,
                COALESCE(CAST(popularity AS DOUBLE), 0.0) AS popularity,
                COALESCE(CAST(release_date AS VARCHAR), '') AS release_date
            FROM read_parquet(${toSqlPath(sourceParquet)})
        `;
    }

    const queries = [];

    if (moviesParquet && fs.existsSync(moviesParquet)) {
        queries.push(`
            SELECT 
                CAST(id AS BIGINT) AS id,
                'movie' AS type,
                COALESCE(CAST(title AS VARCHAR), '') AS title,
                COALESCE(CAST(original_title AS VARCHAR), '') AS original_title,
                COALESCE(CAST(popularity AS DOUBLE), 0.0) AS popularity,
                COALESCE(CAST(release_date AS VARCHAR), '') AS release_date
            FROM read_parquet(${toSqlPath(moviesParquet)})
        `);
    } else if (moviesJsonl && fs.existsSync(moviesJsonl)) {
        queries.push(`
            WITH src AS (
                SELECT 
                    id, 
                    title, 
                    original_title, 
                    popularity, 
                    release_date, 
                    row_number() OVER (PARTITION BY id ORDER BY popularity DESC) as rn
                FROM read_json_auto(${toSqlPath(moviesJsonl)}, ignore_errors=true, sample_size=-1)
            )
            SELECT 
                CAST(id AS BIGINT) AS id,
                'movie' AS type,
                COALESCE(CAST(title AS VARCHAR), '') AS title,
                COALESCE(CAST(original_title AS VARCHAR), '') AS original_title,
                COALESCE(CAST(popularity AS DOUBLE), 0.0) AS popularity,
                COALESCE(CAST(release_date AS VARCHAR), '') AS release_date
            FROM src WHERE rn = 1
        `);
    }

    if (tvParquet && fs.existsSync(tvParquet)) {
        queries.push(`
            SELECT 
                CAST(id AS BIGINT) AS id,
                'tv' AS type,
                COALESCE(CAST(name AS VARCHAR), '') AS title,
                COALESCE(CAST(original_name AS VARCHAR), '') AS original_title,
                COALESCE(CAST(popularity AS DOUBLE), 0.0) AS popularity,
                COALESCE(CAST(first_air_date AS VARCHAR), '') AS release_date
            FROM read_parquet(${toSqlPath(tvParquet)})
        `);
    } else if (tvJsonl && fs.existsSync(tvJsonl)) {
        queries.push(`
            WITH src AS (
                SELECT 
                    id, 
                    name, 
                    original_name, 
                    popularity, 
                    first_air_date, 
                    row_number() OVER (PARTITION BY id ORDER BY popularity DESC) as rn
                FROM read_json_auto(${toSqlPath(tvJsonl)}, ignore_errors=true, sample_size=-1)
            )
            SELECT 
                CAST(id AS BIGINT) AS id,
                'tv' AS type,
                COALESCE(CAST(name AS VARCHAR), '') AS title,
                COALESCE(CAST(original_name AS VARCHAR), '') AS original_title,
                COALESCE(CAST(popularity AS DOUBLE), 0.0) AS popularity,
                COALESCE(CAST(first_air_date AS VARCHAR), '') AS release_date
            FROM src WHERE rn = 1
        `);
    }

    if (queries.length === 0) {
        throw new Error('Nessun file sorgente valido (parquet o jsonl) trovato per la build Tier 2');
    }

    return `
        SELECT * FROM (
            ${queries.join('\nUNION ALL\n')}
        ) ORDER BY popularity DESC
    `;
}

async function buildTier2({
    dataDir = defaultDataDir(),
    dbFile,
    parquetFile,
    sourceParquet,
    exportDir,
    batchSize = 25000
} = {}) {
    const resolvedDataDir = path.resolve(dataDir);
    const resolvedDbFile = dbFile ? path.resolve(dbFile) : path.join(resolvedDataDir, 'titles_fts5.db');
    const resolvedParquetFile = parquetFile ? path.resolve(parquetFile) : path.join(resolvedDataDir, 'tier2_titles.parquet');

    const tmpParquet = resolvedParquetFile + '.tmp';
    const tmpDb = resolvedDbFile + '.tmp';
    const tmpTsv = path.join(resolvedDataDir, `tier2_titles_tmp_${Date.now()}_${process.pid}.tsv`);

    const moviesParquet = path.join(resolvedDataDir, 'movies.parquet');
    const tvParquet = path.join(resolvedDataDir, 'tv.parquet');
    const moviesJsonl = path.join(resolvedDataDir, 'master_movies.jsonl');
    const tvJsonl = path.join(resolvedDataDir, 'master_tv.jsonl');

    // Clean up any stale temp files
    [tmpParquet, tmpDb, tmpTsv].forEach(f => {
        if (fs.existsSync(f)) {
            try { fs.unlinkSync(f); } catch (_) {}
        }
    });

    const startTime = Date.now();
    let duckDb = null;
    let duckCon = null;
    let sqliteDb = null;

    try {
        // Sorgente: il daily export (coda lunga). Ripiego sul Tier 1 **solo** se l'export non si
        // scarica: in quel caso l'indice è incompleto e lo si dice, invece di farlo sembrare giusto.
        // `exportDir: false` disattiva l'export e usa i sorgenti Tier 1 (serve ai test, che girano
        // su fixture locali e non devono toccare la rete).
        let unifiedSelect = null;
        if (!sourceParquet && exportDir !== false) {
            const resolvedExportDir = exportDir ? path.resolve(exportDir) : path.join(resolvedDataDir, 'export');
            const moviesExport = await fetchDailyExport('movies', resolvedExportDir).catch(() => null);
            const tvExport = await fetchDailyExport('tv', resolvedExportDir).catch(() => null);
            if (moviesExport && tvExport) {
                console.log(`[Tier2] Sorgente: daily export (${path.basename(moviesExport)} + ${path.basename(tvExport)})`);
                unifiedSelect = buildExportSelect(moviesExport, tvExport);
            } else {
                console.warn('[Tier2] ATTENZIONE: daily export non disponibile — ripiego sul Tier 1. L\'indice NON conterrà la coda lunga.');
            }
        }

        if (!unifiedSelect) {
            unifiedSelect = buildUnifiedSelect({
                sourceParquet,
                moviesParquet,
                tvParquet,
                moviesJsonl,
                tvJsonl
            });
        }

        // 1. DuckDB: crea vista unificata ed esporta Parquet + TSV
        duckDb = new duckdb.Database(':memory:');
        duckCon = duckDb.connect();

        await new Promise((resolve, reject) => {
            duckCon.run(`CREATE VIEW unified_titles AS ${unifiedSelect}`, (err) => err ? reject(err) : resolve());
        });

        await new Promise((resolve, reject) => {
            duckCon.run(
                `COPY (SELECT * FROM unified_titles) TO ${toSqlPath(tmpParquet)} (FORMAT PARQUET, COMPRESSION 'ZSTD')`,
                (err) => err ? reject(err) : resolve()
            );
        });

        await new Promise((resolve, reject) => {
            duckCon.run(
                `COPY (SELECT id, type, title, original_title, popularity, release_date FROM unified_titles) TO ${toSqlPath(tmpTsv)} (DELIMITER '\t', HEADER false)`,
                (err) => err ? reject(err) : resolve()
            );
        });

        await closeDatabase(duckCon, duckDb);
        duckCon = null;
        duckDb = null;

        // 3. SQLite FTS5: crea titles_fts5_tmp.db e ingerisci dal TSV
        sqliteDb = new Database(tmpDb);
        sqliteDb.pragma('journal_mode = OFF');
        sqliteDb.pragma('synchronous = OFF');
        sqliteDb.pragma('cache_size = -64000'); // 64 MB
        sqliteDb.pragma('temp_store = MEMORY');

        sqliteDb.exec(`
            CREATE VIRTUAL TABLE titles USING fts5(
                id UNINDEXED,
                type UNINDEXED,
                title,
                original_title,
                popularity UNINDEXED,
                release_date UNINDEXED,
                tokenize = 'unicode61 remove_diacritics 2'
            );
        `);

        const insertStmt = sqliteDb.prepare('INSERT INTO titles VALUES (?, ?, ?, ?, ?, ?)');
        const insertBatch = sqliteDb.transaction((batch) => {
            for (const row of batch) {
                insertStmt.run(row[0], row[1], row[2], row[3], row[4], row[5]);
            }
        });

        const rl = readline.createInterface({
            input: fs.createReadStream(tmpTsv, { encoding: 'utf8' }),
            crlfDelay: Infinity
        });

        let batch = [];
        let count = 0;
        for await (const line of rl) {
            if (!line) continue;
            const parts = line.split('\t');
            batch.push(parts);
            count++;
            if (batch.length >= batchSize) {
                insertBatch(batch);
                batch = [];
            }
        }
        if (batch.length > 0) {
            insertBatch(batch);
        }

        sqliteDb.close();
        sqliteDb = null;

        // Rimuovi TSV temporaneo
        if (fs.existsSync(tmpTsv)) {
            try { fs.unlinkSync(tmpTsv); } catch (_) {}
        }

        // 4. Sostituzione atomica: i file precedenti rimangono intatti fino a qui
        await replaceFile(tmpParquet, resolvedParquetFile);
        await replaceFile(tmpDb, resolvedDbFile);

        const durationMs = Date.now() - startTime;
        const parquetSize = fs.statSync(resolvedParquetFile).size;
        const dbSize = fs.statSync(resolvedDbFile).size;

        return {
            success: true,
            count,
            parquetFile: resolvedParquetFile,
            parquetSizeBytes: parquetSize,
            parquetSizeMb: Number((parquetSize / (1024 * 1024)).toFixed(2)),
            dbFile: resolvedDbFile,
            dbSizeBytes: dbSize,
            dbSizeMb: Number((dbSize / (1024 * 1024)).toFixed(2)),
            durationMs,
            durationSeconds: Number((durationMs / 1000).toFixed(2))
        };
    } catch (err) {
        if (duckCon || duckDb) {
            try { await closeDatabase(duckCon, duckDb); } catch (_) {}
        }
        if (sqliteDb) {
            try { sqliteDb.close(); } catch (_) {}
        }
        [tmpParquet, tmpDb, tmpTsv].forEach(f => {
            if (fs.existsSync(f)) {
                try { fs.unlinkSync(f); } catch (_) {}
            }
        });
        throw err;
    }
}

class Tier2SearchClient {
    constructor({ dbPath = path.join(defaultDataDir(), 'titles_fts5.db'), readOnly = true } = {}) {
        this.dbPath = path.resolve(dbPath);
        this.readOnly = readOnly;
        this.db = null;
        this._searchStmt = null;
        this._searchTypeStmt = null;
    }

    init() {
        if (this.db) return true;
        if (!fs.existsSync(this.dbPath)) return false;

        this.db = new Database(this.dbPath, { readonly: this.readOnly });
        this.db.pragma('cache_size = -16000'); // 16 MB cache
        this._searchStmt = this.db.prepare(`
            SELECT id, type, title, original_title, popularity, release_date
            FROM titles
            WHERE titles MATCH ?
            ORDER BY rank
            LIMIT ?
        `);
        this._searchTypeStmt = this.db.prepare(`
            SELECT id, type, title, original_title, popularity, release_date
            FROM titles
            WHERE titles MATCH ? AND type = ?
            ORDER BY rank
            LIMIT ?
        `);
        return true;
    }

    search(rawQuery, { limit = 20, type = null } = {}) {
        if (!this.init()) return [];
        const sanitized = sanitizeFts5Query(rawQuery);
        if (!sanitized) return [];

        try {
            if (type && ['movie', 'tv'].includes(type)) {
                return this._searchTypeStmt.all(sanitized, type, limit);
            }
            return this._searchStmt.all(sanitized, limit);
        } catch (err) {
            console.error('[Tier2Search] Query error:', err.message);
            return [];
        }
    }

    close() {
        if (this.db) {
            try {
                this.db.close();
            } catch (_) {}
            this.db = null;
            this._searchStmt = null;
            this._searchTypeStmt = null;
        }
    }
}

function getTier2Stats({ dataDir = defaultDataDir(), dbFile, parquetFile } = {}) {
    const resolvedDataDir = path.resolve(dataDir);
    const resolvedDbFile = dbFile ? path.resolve(dbFile) : path.join(resolvedDataDir, 'titles_fts5.db');
    const resolvedParquetFile = parquetFile ? path.resolve(parquetFile) : path.join(resolvedDataDir, 'tier2_titles.parquet');

    const dbExists = fs.existsSync(resolvedDbFile);
    const parquetExists = fs.existsSync(resolvedParquetFile);

    let dbRows = null;
    let dbSizeMb = 0;
    if (dbExists) {
        dbSizeMb = Number((fs.statSync(resolvedDbFile).size / (1024 * 1024)).toFixed(2));
        try {
            const db = new Database(resolvedDbFile, { readonly: true });
            const row = db.prepare('SELECT count(*) as count FROM titles').get();
            dbRows = Number(row?.count || 0);
            db.close();
        } catch (_) {}
    }

    let parquetSizeMb = 0;
    if (parquetExists) {
        parquetSizeMb = Number((fs.statSync(resolvedParquetFile).size / (1024 * 1024)).toFixed(2));
    }

    return {
        dataDir: resolvedDataDir,
        dbFile: resolvedDbFile,
        dbExists,
        dbSizeMb,
        dbRows,
        parquetFile: resolvedParquetFile,
        parquetExists,
        parquetSizeMb
    };
}

module.exports = {
    buildTier2,
    fetchDailyExport,
    buildExportSelect,
    sanitizeFts5Query,
    Tier2SearchClient,
    getTier2Stats,
    defaultDataDir
};
