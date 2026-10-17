const duckdb = require('duckdb');
const path = require('path');
const fs = require('fs');

const TMDB_IMDB_CACHE_MAX = 500;

class DuckDbStore {
    constructor() {
        this.db = null;
        this.con = null;
        this.isInitialized = false;
        
        // Determina il percorso della cache usando lo stesso pattern di tmdbDumpStore
        this.basePath = fs.existsSync('/data') 
            ? '/data/tmdb' 
            : path.resolve(__dirname, '../../.cache/tmdb');
            
        this.moviesParquetPath = path.join(this.basePath, 'movies.parquet');
        this.tvParquetPath = path.join(this.basePath, 'tv.parquet');
        this.dbPath = process.env.DUCKDB_PATH || path.join(this.basePath, 'catalog.duckdb');
        this.masterMoviesJsonlPath = path.join(this.basePath, 'master_movies.jsonl');
        this.masterTvJsonlPath = path.join(this.basePath, 'master_tv.jsonl');

        // TMDB id → IMDb id letti dal dump: solo i risultati trovati (mai i "non trovato",
        // così un titolo promosso a Tier 1 dopo è visibile subito).
        this.tmdbImdbIdCache = new Map();
    }

    _cleanupDbFiles(filePath) {
        if (!filePath || filePath === ':memory:') return;
        const targets = [filePath, `${filePath}.wal`];
        for (const target of targets) {
            try {
                if (fs.existsSync(target)) fs.unlinkSync(target);
            } catch (_) {}
        }
    }

    _isDatabaseFresh() {
        if (!fs.existsSync(this.dbPath)) return false;
        try {
            const dbStat = fs.statSync(this.dbPath);
            if (dbStat.size === 0) return false;

            // Se esiste movies.parquet, catalog.duckdb deve essere >= movies.parquet
            if (fs.existsSync(this.moviesParquetPath)) {
                const moviesStat = fs.statSync(this.moviesParquetPath);
                if (moviesStat.mtimeMs > dbStat.mtimeMs) return false;
            }

            // Se esiste tv.parquet, catalog.duckdb deve essere >= tv.parquet
            if (fs.existsSync(this.tvParquetPath)) {
                const tvStat = fs.statSync(this.tvParquetPath);
                if (tvStat.mtimeMs > dbStat.mtimeMs) return false;
            }

            // Se esistono i JSONL master, catalog.duckdb deve essere >= JSONL
            if (fs.existsSync(this.masterMoviesJsonlPath)) {
                const jsonlStat = fs.statSync(this.masterMoviesJsonlPath);
                if (jsonlStat.mtimeMs > dbStat.mtimeMs) return false;
            }
            if (fs.existsSync(this.masterTvJsonlPath)) {
                const jsonlStat = fs.statSync(this.masterTvJsonlPath);
                if (jsonlStat.mtimeMs > dbStat.mtimeMs) return false;
            }

            return true;
        } catch (_) {
            return false;
        }
    }

    _openDb(dbFile) {
        return new Promise((resolve, reject) => {
            const db = new duckdb.Database(dbFile, { max_memory: '2GB' }, (err) => {
                if (err) return reject(err);
                resolve(db);
            });
        });
    }

    _exec(con, sql) {
        return new Promise((resolve, reject) => {
            con.exec(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    _all(con, sql, params = []) {
        return new Promise((resolve, reject) => {
            con.all(sql, ...params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    _closeCon(con) {
        if (!con) return Promise.resolve();
        return new Promise((resolve) => {
            try {
                con.close(() => resolve());
            } catch (_) {
                resolve();
            }
        });
    }

    _closeDb(db) {
        if (!db) return Promise.resolve();
        return new Promise((resolve) => {
            try {
                db.close(() => resolve());
            } catch (_) {
                resolve();
            }
        });
    }

    async _verifyDatabase(con) {
        const tables = await this._all(con, "SELECT table_name FROM duckdb_tables WHERE schema_name = 'main';");
        const tableNames = new Set((tables || []).map(t => t.table_name));

        if (!tableNames.has('movies') || !tableNames.has('tv') || !tableNames.has('anime_mappings')) {
            throw new Error(`Tabelle obbligatorie mancanti (trovate: ${Array.from(tableNames).join(', ')})`);
        }

        if (fs.existsSync(this.moviesParquetPath)) {
            const mRows = await this._all(con, "SELECT count(*) AS n FROM movies;");
            const count = Number(mRows && mRows[0] ? mRows[0].n : 0);
            if (count === 0) throw new Error("Tabella movies presente ma vuota nonostante movies.parquet esista");
            await this._all(con, "SELECT fts_main_movies.match_bm25(id, 'the') FROM movies LIMIT 1;");
            await this._all(con, "SELECT watch_providers_us, title_en FROM movies LIMIT 1;");
        }

        if (fs.existsSync(this.tvParquetPath)) {
            const tvRows = await this._all(con, "SELECT count(*) AS n FROM tv;");
            const count = Number(tvRows && tvRows[0] ? tvRows[0].n : 0);
            if (count === 0) throw new Error("Tabella tv presente ma vuota nonostante tv.parquet esista");
            await this._all(con, "SELECT fts_main_tv.match_bm25(id, 'the') FROM tv LIMIT 1;");
            await this._all(con, "SELECT watch_providers_us, name_en FROM tv LIMIT 1;");
        }

        await this._all(con, "SELECT count(*) FROM anime_mappings;");
        return true;
    }

    async init(options = {}) {
        const forceRebuild = Boolean(options && options.forceRebuild);
        if (this.isInitialized && !forceRebuild) return this.initPromise;
        if (this.initPromise && !forceRebuild) return this.initPromise;

        if (!fs.existsSync(this.basePath)) {
            try { fs.mkdirSync(this.basePath, { recursive: true }); } catch (_) {}
        }

        console.log(`[DuckDB Store] Inizializzazione in corso...`);
        if (!fs.existsSync(this.moviesParquetPath) && !fs.existsSync(this.tvParquetPath)) {
            console.warn(`[DuckDB Store] Attenzione: File Parquet non trovati in ${this.basePath}.`);
            console.warn(`[DuckDB Store] DuckDB è avviato in memoria vuota. Per favore attendi la fine del sync o lancia scripts/convert_to_parquet.js`);
        }

        this.initPromise = (async () => {
            const isMemory = this.dbPath === ':memory:';
            let reopened = false;

            // 1. Prova a riaprire il database persistente esistente se fresco e non forzato
            if (!isMemory && !forceRebuild && this._isDatabaseFresh()) {
                let testDb = null;
                let testCon = null;
                try {
                    testDb = await this._openDb(this.dbPath);
                    testCon = testDb.connect();
                    await this._exec(testCon, "INSTALL fts;");
                    await this._exec(testCon, "LOAD fts;");
                    await this._exec(testCon, "SET scalar_subquery_error_on_multiple_rows=false;");
                    await this._verifyDatabase(testCon);

                    this.db = testDb;
                    this.con = testCon;
                    reopened = true;
                    console.log(`[DuckDB Store] Database persistente valido riaperto con successo da ${this.dbPath}.`);
                } catch (err) {
                    console.warn(`[DuckDB Store] Database persistente esistente non valido o corrotto (${err.message}). Ricostruzione da zero...`);
                    await this._closeCon(testCon);
                    await this._closeDb(testDb);
                    this._cleanupDbFiles(this.dbPath);
                    reopened = false;
                }
            }

            // 2. Se non è stato possibile riaprirlo, procedi con la costruzione completa
            if (!reopened) {
                const targetDbPath = isMemory ? ':memory:' : `${this.dbPath}.tmp`;
                if (!isMemory) {
                    this._cleanupDbFiles(targetDbPath);
                }

                let buildDb = null;
                let buildCon = null;
                try {
                    buildDb = await this._openDb(targetDbPath);
                    buildCon = buildDb.connect();

                    await this._exec(buildCon, "INSTALL fts;");
                    await this._exec(buildCon, "LOAD fts;");
                    await this._exec(buildCon, "SET scalar_subquery_error_on_multiple_rows=false;");

                    if (fs.existsSync(this.moviesParquetPath)) {
                        await this._exec(buildCon, `DROP TABLE IF EXISTS movies;`);
                        await this._exec(buildCon, `CREATE TABLE movies AS SELECT * FROM read_parquet('${this.moviesParquetPath.replace(/\\/g, '/')}');`);
                        await this._exec(buildCon, `PRAGMA create_fts_index('movies', 'id', 'title', 'original_title');`);
                    } else {
                        await this._exec(buildCon, `CREATE TABLE IF NOT EXISTS movies (id BIGINT, title VARCHAR, original_title VARCHAR, overview VARCHAR, poster_path VARCHAR, backdrop_path VARCHAR, release_date VARCHAR, vote_average DOUBLE, vote_count BIGINT, popularity DOUBLE, genres VARCHAR, keywords VARCHAR, watch_providers_it VARCHAR, watch_providers_us VARCHAR, production_companies VARCHAR, production_countries VARCHAR, original_language VARCHAR, adult BOOLEAN, title_en VARCHAR);`);
                    }

                    if (fs.existsSync(this.tvParquetPath)) {
                        await this._exec(buildCon, `DROP TABLE IF EXISTS tv;`);
                        await this._exec(buildCon, `CREATE TABLE tv AS SELECT * FROM read_parquet('${this.tvParquetPath.replace(/\\/g, '/')}');`);
                        await this._exec(buildCon, `PRAGMA create_fts_index('tv', 'id', 'name', 'original_name');`);
                    } else {
                        await this._exec(buildCon, `CREATE TABLE IF NOT EXISTS tv (id BIGINT, name VARCHAR, original_name VARCHAR, overview VARCHAR, poster_path VARCHAR, backdrop_path VARCHAR, first_air_date VARCHAR, vote_average DOUBLE, vote_count BIGINT, popularity DOUBLE, genres VARCHAR, keywords VARCHAR, watch_providers_it VARCHAR, watch_providers_us VARCHAR, networks VARCHAR, production_companies VARCHAR, production_countries VARCHAR, original_language VARCHAR, number_of_seasons INTEGER, number_of_episodes INTEGER, status VARCHAR, adult BOOLEAN, name_en VARCHAR);`);
                    }

                    await this._exec(buildCon, `DROP TABLE IF EXISTS anime_mappings;`);
                    await this._exec(buildCon, `CREATE TABLE anime_mappings (tmdb_id BIGINT, tipo VARCHAR, PRIMARY KEY (tmdb_id, tipo));`);

                    await this._exec(buildCon, 'ALTER TABLE movies ADD COLUMN IF NOT EXISTS watch_providers_us VARCHAR;');
                    await this._exec(buildCon, 'ALTER TABLE tv ADD COLUMN IF NOT EXISTS watch_providers_us VARCHAR;');
                    await this._exec(buildCon, 'ALTER TABLE movies ADD COLUMN IF NOT EXISTS title_en VARCHAR;');
                    await this._exec(buildCon, 'ALTER TABLE tv ADD COLUMN IF NOT EXISTS name_en VARCHAR;');

                    console.log(`[DuckDB Store] Tabelle caricate in RAM e indici FTS creati con successo.`);

                    if (!isMemory) {
                        await this._closeCon(buildCon);
                        buildCon = null;
                        await this._closeDb(buildDb);
                        buildDb = null;

                        this._cleanupDbFiles(this.dbPath);
                        if (fs.existsSync(this.dbPath)) {
                            try { fs.unlinkSync(this.dbPath); } catch (_) {}
                        }
                        fs.renameSync(targetDbPath, this.dbPath);
                        if (fs.existsSync(`${targetDbPath}.wal`)) {
                            if (fs.existsSync(`${this.dbPath}.wal`)) {
                                try { fs.unlinkSync(`${this.dbPath}.wal`); } catch (_) {}
                            }
                            fs.renameSync(`${targetDbPath}.wal`, `${this.dbPath}.wal`);
                        }

                        this.db = await this._openDb(this.dbPath);
                        this.con = this.db.connect();
                        await this._exec(this.con, "INSTALL fts;");
                        await this._exec(this.con, "LOAD fts;");
                        await this._exec(this.con, "SET scalar_subquery_error_on_multiple_rows=false;");
                    } else {
                        this.db = buildDb;
                        this.con = buildCon;
                    }
                } catch (buildErr) {
                    await this._closeCon(buildCon);
                    await this._closeDb(buildDb);
                    if (!isMemory) this._cleanupDbFiles(targetDbPath);
                    this.initPromise = null;
                    throw buildErr;
                }
            }

            this.isInitialized = true;

            // Seeding anime mappings post-init se presenti
            const { animeMappingStore } = require('../anime');
            if (animeMappingStore.animeTmdbIdsMovie || animeMappingStore.animeTmdbIdsShow) {
                const movieIds = animeMappingStore.animeTmdbIdsMovie ? Array.from(animeMappingStore.animeTmdbIdsMovie) : [];
                const tvIds = animeMappingStore.animeTmdbIdsShow ? Array.from(animeMappingStore.animeTmdbIdsShow) : [];
                if (movieIds.length > 0 || tvIds.length > 0) {
                    await this.updateAnimeMapping({ movie: movieIds, tv: tvIds }).catch(e => console.error('[DuckDB Store] Errore updateAnimeMapping post-init:', e));
                }
            }

            await this.buildDfCache().catch(e => console.warn('[DuckDB Store] Warning buildDfCache:', e.message));
        })();

        return this.initPromise;
    }

    async updateAnimeMapping(idsByType) {
        if (!this.isInitialized) {
            await this.init();
        }
        
        // Ticket 13: validazione rigorosa della forma { movie, tv }. Qualsiasi altra forma genera console.warn e no-op (mai indovinare il tipo).
        const isValidIterable = (val) => Array.isArray(val) || (val !== null && typeof val === 'object' && typeof val[Symbol.iterator] === 'function');
        if (!idsByType || typeof idsByType !== 'object' || Array.isArray(idsByType) || !isValidIterable(idsByType.movie) || !isValidIterable(idsByType.tv)) {
            console.warn('[DuckDB Store] updateAnimeMapping: forma non valida (richiesto { movie: [...], tv: [...] }), no-op');
            return;
        }

        const normalizeList = (rawList) => {
            let list = [];
            if (Array.isArray(rawList)) {
                list = rawList;
            } else if (rawList && typeof rawList[Symbol.iterator] === 'function') {
                list = Array.from(rawList);
            } else if (rawList !== null && rawList !== undefined) {
                list = [rawList];
            }

            const validIds = [];
            let invalidCount = 0;

            for (const rawId of list) {
                let str = String(rawId || '').trim();
                if (!str) {
                    invalidCount++;
                    continue;
                }
                // Rimuove prefissi noti come tmdb_show:, tmdb_movie:, o qualsiasi prefisso alfabetico con underscore
                str = str.replace(/^(?:[a-zA-Z][a-zA-Z0-9_]*:)+/, '');
                // Estrae la parte prima di ':' (suffisso stagione, es. 12345:1 -> 12345)
                const idPart = str.split(':')[0].trim();
                const clean = Number(idPart);
                if (Number.isInteger(clean) && clean > 0) {
                    validIds.push(clean);
                } else {
                    invalidCount++;
                }
            }

            const uniqueIds = Array.from(new Set(validIds));
            return { uniqueIds, invalidCount, totalCount: list.length };
        };

        const movieNorm = normalizeList(idsByType.movie);
        const tvNorm = normalizeList(idsByType.tv);

        return new Promise((resolve, reject) => {
            let sql = `
                DROP TABLE IF EXISTS anime_mappings;
                CREATE TABLE anime_mappings (tmdb_id BIGINT, tipo VARCHAR, PRIMARY KEY (tmdb_id, tipo));
            `;

            const rows = [
                ...movieNorm.uniqueIds.map(id => `(${id}, 'movie')`),
                ...tvNorm.uniqueIds.map(id => `(${id}, 'tv')`)
            ];

            if (rows.length > 0) {
                // Inserimento a blocchi per evitare limiti su dimensioni query SQL
                const chunkSize = 2000;
                for (let i = 0; i < rows.length; i += chunkSize) {
                    const chunk = rows.slice(i, i + chunkSize);
                    sql += `\nINSERT INTO anime_mappings VALUES ${chunk.join(',')};`;
                }
            }

            this.con.exec(sql, (err) => {
                if (err) {
                    console.error('[DuckDB Store] Errore aggiornamento tabella anime_mappings:', err);
                    return reject(err);
                }
                const totalInserted = movieNorm.uniqueIds.length + tvNorm.uniqueIds.length;
                console.log(`[DuckDB Store] Tabella anime_mappings creata in RAM con ${totalInserted} anime certificati (${movieNorm.uniqueIds.length} movie, ${tvNorm.uniqueIds.length} tv).`);
                resolve();
            });
        });
    }

    async query(sql, params = []) {
        if (!this.isInitialized) {
            await this.init();
        }

        if (typeof sql === 'object' && sql !== null && typeof sql.sql === 'string') {
            params = sql.params || [];
            sql = sql.sql;
        }

        return new Promise((resolve, reject) => {
            // Protezione query a tabelle vuote
            if (/\bFROM\s+movies\b/i.test(sql) && !fs.existsSync(this.moviesParquetPath)) {
                return resolve([]); 
            }
            if (/\bFROM\s+tv\b/i.test(sql) && !fs.existsSync(this.tvParquetPath)) {
                return resolve([]); 
            }
            
            // Usiamo con.all per ottenere tutti i risultati come array di oggetti JS
            this.con.all(sql, ...params, (err, res) => {
                if (err) {
                    console.error(`[DuckDB Store] Errore Query: ${sql}`, err);
                    return reject(err);
                }
                resolve(res);
            });
        });
    }

    /**
     * Risolve un array di IMDb ID (tt...) in { tmdbId, type } via parquet DuckDB in-memory.
     * @param {string[]} imdbIds
     * @returns {Promise<Record<string, { tmdbId: number, type: 'movie'|'tv' }>>}
     */
    async resolveImdbIds(imdbIds) {
        if (!Array.isArray(imdbIds) || imdbIds.length === 0) return {};
        if (!this.isInitialized) await this.init();

        const cleanIds = Array.from(new Set(
            imdbIds
                .map(id => String(id || '').trim())
                .filter(id => /^tt\d+$/.test(id))
        ));
        if (cleanIds.length === 0) return {};

        const mapping = {};
        const chunkSize = 500;
        for (let i = 0; i < cleanIds.length; i += chunkSize) {
            const chunk = cleanIds.slice(i, i + chunkSize);
            const inList = chunk.map(id => `'${id}'`).join(',');
            const sql = `
                SELECT id, imdb_id, 'movie' as type FROM movies WHERE imdb_id IN (${inList})
                UNION ALL
                SELECT id, imdb_id, 'tv' as type FROM tv WHERE imdb_id IN (${inList})
            `;
            try {
                const rows = await this.query(sql);
                for (const row of (rows || [])) {
                    if (row.imdb_id && row.id) {
                        mapping[row.imdb_id] = {
                            tmdbId: Number(row.id),
                            type: row.type === 'tv' ? 'tv' : 'movie'
                        };
                    }
                }
            } catch (err) {
                console.error('[DuckDbStore] Errore resolveImdbIds:', err.message);
            }
        }
        return mapping;
    }

    /**
     * Risolve TMDB id → IMDb id leggendo la colonna `imdb_id` dei parquet (`movies`/`tv`).
     *
     * È il verso opposto di `resolveImdbIds`, e serve a non fare richieste di rete: se il titolo
     * è nel dump (Tier 1) l'id IMDb è già qui, quindi non serve chiederlo a TMDB. Quando il
     * titolo non c'è — cioè è la coda lunga — semplicemente non risponde, e il chiamante cade
     * sulla strada che usava prima (cache `tmdb_imdb_id`, e rete solo se proprio serve).
     *
     * Non è una cache: se il titolo viene promosso a Tier 1 la risposta cambia subito, quindi
     * qui si tengono solo gli id trovati (bounded), mai i "non trovato".
     *
     * @param {Array<string|number>} tmdbIds
     * @param {'movie'|'tv'|'both'} [type] Tabella da leggere (default: entrambe).
     * @returns {Promise<Record<string, string>>} `{ '<tmdbId>': 'tt…' }`
     */
    async resolveTmdbToImdb(tmdbIds, type = 'both') {
        if (!Array.isArray(tmdbIds) || tmdbIds.length === 0) return {};

        const wanted = type === 'movie' || type === 'tv' ? type : 'both';
        const ids = Array.from(new Set(
            tmdbIds
                .map(raw => Number(String(raw ?? '').replace(/^tmdb:/i, '').trim()))
                .filter(n => Number.isInteger(n) && n > 0)
        ));
        if (ids.length === 0) return {};

        const mapping = {};
        const tables = wanted === 'both' ? ['movies', 'tv'] : [wanted === 'movie' ? 'movies' : 'tv'];
        const inList = ids.join(',');

        for (const table of tables) {
            // Senza parquet non c'è dump: si risponde vuoto **senza** inizializzare DuckDB,
            // così questa strada non può costringere un cold start a un processo che
            // del dump (per ora) non si serve.
            const parquetPath = table === 'movies' ? this.moviesParquetPath : this.tvParquetPath;
            if (!fs.existsSync(parquetPath)) continue;

            const rows = await this.resolveTmdbToImdbUncached(table, inList);
            for (const row of rows) {
                const imdbId = row.imdb_id ? String(row.imdb_id).trim() : '';
                if (!/^tt\d+$/.test(imdbId)) continue;
                const key = String(Number(row.id));
                if (!mapping[key]) {
                    mapping[key] = imdbId;
                    this.rememberTmdbImdbId(key, imdbId);
                }
            }
        }

        for (const id of ids) {
            const key = String(id);
            if (mapping[key]) continue;
            const cached = this.tmdbImdbIdCache.get(key);
            if (cached) mapping[key] = cached;
        }

        return mapping;
    }

    /**
     * Lettura singola dal dump, con cache dei soli risultati trovati.
     * @param {string} table `movies` o `tv`.
     * @param {string} inList Lista di id già sanitizzata (interi separati da virgola).
     * @returns {Promise<Array<{id: number, imdb_id: string}>>}
     */
    async resolveTmdbToImdbUncached(table, inList) {
        const sql = `SELECT CAST(id AS BIGINT) AS id, imdb_id FROM ${table} WHERE id IN (${inList})`;
        try {
            const rows = await this.query(sql);
            return Array.isArray(rows) ? rows : [];
        } catch (err) {
            // Dump vecchio senza la colonna `imdb_id`, tabella assente, parquet non
            // caricato: degrado deciso, il chiamante cade sulla strada che usava prima.
            console.warn('[DuckDbStore] resolveTmdbToImdb: lettura da', table, 'fallita:', err.message);
            return [];
        }
    }

    /** Cache bounded dei soli id trovati nel dump (bounded FIFO, come le altre mappe in RAM). */
    rememberTmdbImdbId(key, imdbId) {
        if (this.tmdbImdbIdCache.size >= TMDB_IMDB_CACHE_MAX) {
            const oldest = this.tmdbImdbIdCache.keys().next().value;
            if (oldest !== undefined) this.tmdbImdbIdCache.delete(oldest);
        }
        this.tmdbImdbIdCache.set(key, imdbId);
    }

    /**
     * Calcola e memorizza in RAM la tabella dei Document Frequencies (DF)
     * per il calcolo della rarità dolce nel DNA.
     *
     * Dalla stessa lettura costruisce anche la mappa id <-> nome delle keyword
     * (ticket «il livello latente»): il grafo gerarchico è indicizzato per NOME,
     * mentre parquet, preset e ProfileBuilder consegnano ID. Senza la mappa un id
     * non raggiunge `L1:`-`L5:` e il contenuto del DNA dipendeva dall'ordine delle
     * richieste nel processo. Costo: zero query in più — le keyword si leggono già
     * tutte qui per la rarità.
     */
    async buildDfCache() {
        if (!this.isInitialized) return;
        try {
            const genresRes = await this.query(`
                SELECT 'g:' || (json_extract(g, '$.id')::VARCHAR) as k, count(*) as df
                FROM (
                    SELECT unnest(from_json(genres, '["JSON"]')) as g FROM movies WHERE genres IS NOT NULL
                    UNION ALL
                    SELECT unnest(from_json(genres, '["JSON"]')) as g FROM tv WHERE genres IS NOT NULL
                ) GROUP BY k
            `);
            const kwRes = await this.query(`
                SELECT 'k:' || (k->>'id') as k, max(k->>'name') as name, count(*) as df
                FROM (
                    SELECT unnest(from_json(keywords, '["JSON"]')) as k FROM movies WHERE keywords IS NOT NULL
                    UNION ALL
                    SELECT unnest(from_json(keywords, '["JSON"]')) as k FROM tv WHERE keywords IS NOT NULL
                ) GROUP BY k
            `);
            const dfMap = new Map();
            for (const r of (genresRes || [])) if (r.k) dfMap.set(r.k, Number(r.df));

            const idToName = new Map();
            const nameToId = new Map();
            for (const r of (kwRes || [])) {
                if (!r.k) continue;
                const df = Number(r.df);
                dfMap.set(r.k, df);
                const id = String(r.k).slice(2);
                const name = typeof r.name === 'string' ? r.name.trim().toLowerCase() : '';
                if (!name) continue;
                // Le due forme della stessa keyword devono avere la STESSA rarità:
                // il vettore può contenerle entrambe (id + nome) e un fallback
                // stimato per una sola delle due altererebbe i pesi in silenzio.
                dfMap.set(`k:${name}`, df);
                idToName.set(id, name);
                if (!nameToId.has(name)) nameToId.set(name, id);
            }
            const { setGlobalDfCache } = require('../utils/dnaRarity');
            setGlobalDfCache(dfMap);

            const { setKeywordNameMaps } = require('../data/keywordIds');
            setKeywordNameMaps({ idToName, nameToId });
            // La mappa cambia ciò che `vectorizeKeywords` può produrre: le cache
            // costruite prima dell'iniezione (es. in un test, o se il dump si
            // carica dopo le prime richieste) vanno buttate, non riusate.
            try {
                require('../engines/keywords/HierarchicalGraph').invalidateKeywordCaches();
            } catch (_e) { /* grafo non caricato: niente da invalidare */ }
        } catch (err) {
            console.warn('[DuckDbStore] Error building DF cache:', err.message);
        }
    }

    async close(callback) {
        const oldCon = this.con;
        const oldDb = this.db;
        this.con = null;
        this.db = null;
        this.initPromise = null;
        this.isInitialized = false;

        await this._closeCon(oldCon);
        await this._closeDb(oldDb);

        if (callback) callback();
    }
}

// Esportiamo un'istanza singola (Singleton)
const duckDbStore = new DuckDbStore();
module.exports = duckDbStore;
