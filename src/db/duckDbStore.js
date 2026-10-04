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

        // TMDB id → IMDb id letti dal dump: solo i risultati trovati (mai i "non trovato",
        // così un titolo promosso a Tier 1 dopo è visibile subito).
        this.tmdbImdbIdCache = new Map();
    }

    async init() {
        if (this.isInitialized) return this.initPromise;
        if (this.initPromise) return this.initPromise;

        console.log(`[DuckDB Store] Inizializzazione in corso...`);
        if (!fs.existsSync(this.moviesParquetPath) && !fs.existsSync(this.tvParquetPath)) {
            console.warn(`[DuckDB Store] Attenzione: File Parquet non trovati in ${this.basePath}.`);
            console.warn(`[DuckDB Store] DuckDB è avviato in memoria vuota. Per favore attendi la fine del sync o lancia scripts/convert_to_parquet.js`);
        }
        
        this.initPromise = new Promise((resolve, reject) => {
            // Avvio con limite di memoria per sicurezza su HF
            this.db = new duckdb.Database(':memory:', { max_memory: '2GB' }, (err) => {
                if (err) {
                    this.initPromise = null;
                    return reject(err);
                }
                
                this.con = this.db.connect();
                
                const execPromise = (sql) => new Promise((resolve, reject) => {
                    this.con.exec(sql, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                (async () => {
                    try {
                        await execPromise("INSTALL fts;");
                        await execPromise("LOAD fts;");
                        await execPromise("SET scalar_subquery_error_on_multiple_rows=false;");
                        
                        if (fs.existsSync(this.moviesParquetPath)) {
                            await execPromise(`DROP TABLE IF EXISTS movies;`);
                            await execPromise(`CREATE TABLE movies AS SELECT * FROM read_parquet('${this.moviesParquetPath.replace(/\\/g, '/')}');`);
                            await execPromise(`PRAGMA create_fts_index('movies', 'id', 'title', 'original_title');`);
                        } else {
                            await execPromise(`CREATE TABLE IF NOT EXISTS movies (id BIGINT, title VARCHAR, original_title VARCHAR, overview VARCHAR, poster_path VARCHAR, backdrop_path VARCHAR, release_date VARCHAR, vote_average DOUBLE, vote_count BIGINT, popularity DOUBLE, genres VARCHAR, keywords VARCHAR, watch_providers_it VARCHAR, watch_providers_us VARCHAR, production_companies VARCHAR, production_countries VARCHAR, original_language VARCHAR, adult BOOLEAN);`);
                        }
                        
                        if (fs.existsSync(this.tvParquetPath)) {
                            await execPromise(`DROP TABLE IF EXISTS tv;`);
                            await execPromise(`CREATE TABLE tv AS SELECT * FROM read_parquet('${this.tvParquetPath.replace(/\\/g, '/')}');`);
                            await execPromise(`PRAGMA create_fts_index('tv', 'id', 'name', 'original_name');`);
                        } else {
                            await execPromise(`CREATE TABLE IF NOT EXISTS tv (id BIGINT, name VARCHAR, original_name VARCHAR, overview VARCHAR, poster_path VARCHAR, backdrop_path VARCHAR, first_air_date VARCHAR, vote_average DOUBLE, vote_count BIGINT, popularity DOUBLE, genres VARCHAR, keywords VARCHAR, watch_providers_it VARCHAR, watch_providers_us VARCHAR, networks VARCHAR, production_companies VARCHAR, production_countries VARCHAR, original_language VARCHAR, number_of_seasons INTEGER, number_of_episodes INTEGER, status VARCHAR, adult BOOLEAN);`);
                        }

                        await execPromise(`CREATE TABLE IF NOT EXISTS anime_mappings (tmdb_id BIGINT PRIMARY KEY);`);

                        console.log(`[DuckDB Store] Tabelle caricate in RAM e indici FTS creati con successo.`);

                        // I dump di produzione più recenti non contengono ancora la colonna US:
                        // mantenerla nullable evita query non portabili sui preset regionali.
                        await execPromise('ALTER TABLE movies ADD COLUMN IF NOT EXISTS watch_providers_us VARCHAR;');
                        await execPromise('ALTER TABLE tv ADD COLUMN IF NOT EXISTS watch_providers_us VARCHAR;');
                        this.isInitialized = true;

                        // Assicuriamoci di importare i mapping anime se sono già stati scaricati
                        const animeMappingStore = require('../data/animeMappingStore');
                        if (animeMappingStore.tmdbToAnimeNode && animeMappingStore.tmdbToAnimeNode.size > 0) {
                            const allTmdbAnimeIds = Array.from(animeMappingStore.tmdbToAnimeNode.keys());
                            this.updateAnimeMapping(allTmdbAnimeIds).catch(e => console.error('[DuckDB Store] Errore updateAnimeMapping post-init:', e));
                        }

                        // Popola la cache dei Document Frequencies (DF) per la rarità dolce DNA
                        this.buildDfCache().catch(e => console.warn('[DuckDB Store] Warning buildDfCache:', e.message));

                        resolve();
                    } catch (errExec) {
                        console.error(`[DuckDB Store] Errore inizializzazione tabelle/FTS:`, errExec);
                        this.initPromise = null;
                        reject(errExec);
                    }
                })();
            });
        });
        return this.initPromise;
    }

    async updateAnimeMapping(tmdbIds) {
        if (!this.isInitialized) {
            console.warn('[DuckDB Store] DB non inizializzato, ignoro updateAnimeMapping.');
            return;
        }
        
        return new Promise((resolve, reject) => {
            let sql = `
                DROP TABLE IF EXISTS anime_mappings;
                CREATE TABLE anime_mappings (tmdb_id BIGINT PRIMARY KEY);
            `;
            
            let rawList = [];
            if (Array.isArray(tmdbIds)) {
                rawList = tmdbIds;
            } else if (tmdbIds && typeof tmdbIds[Symbol.iterator] === 'function') {
                rawList = Array.from(tmdbIds);
            } else if (tmdbIds !== null && tmdbIds !== undefined) {
                rawList = [tmdbIds];
            }

            const validIds = [];
            let invalidCount = 0;

            for (const rawId of rawList) {
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
            const duplicatesCount = validIds.length - uniqueIds.length;
            const totalDiscarded = rawList.length - uniqueIds.length;

            if (uniqueIds.length > 0) {
                const values = uniqueIds.map(id => `(${id})`).join(',');
                sql += `\nINSERT INTO anime_mappings VALUES ${values};`;
            }
            
            this.con.exec(sql, (err) => {
                if (err) {
                    console.error('[DuckDB Store] Errore aggiornamento tabella anime_mappings:', err);
                    return reject(err);
                }
                let discardedMsg = '';
                if (totalDiscarded > 0) {
                    const details = [];
                    if (duplicatesCount > 0) details.push(`${duplicatesCount} ${duplicatesCount === 1 ? 'duplicato' : 'duplicati'}`);
                    if (invalidCount > 0) details.push(`${invalidCount} non ${invalidCount === 1 ? 'valido' : 'validi'}`);
                    discardedMsg = ` (${totalDiscarded} ${totalDiscarded === 1 ? 'scartato' : 'scartati'}: ${details.join(', ')})`;
                }
                console.log(`[DuckDB Store] Tabella anime_mappings creata in RAM con ${uniqueIds.length} anime certificati${discardedMsg}.`);
                resolve();
            });
        });
    }

    async query(sql, params = []) {
        if (!this.isInitialized) {
            await this.init();
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
                SELECT 'k:' || (k->>'id') as k, count(*) as df
                FROM (
                    SELECT unnest(from_json(keywords, '["JSON"]')) as k FROM movies WHERE keywords IS NOT NULL
                    UNION ALL
                    SELECT unnest(from_json(keywords, '["JSON"]')) as k FROM tv WHERE keywords IS NOT NULL
                ) GROUP BY k
            `);
            const dfMap = new Map();
            for (const r of (genresRes || [])) if (r.k) dfMap.set(r.k, Number(r.df));
            for (const r of (kwRes || [])) if (r.k) dfMap.set(r.k, Number(r.df));
            const { setGlobalDfCache } = require('../utils/dnaRarity');
            setGlobalDfCache(dfMap);
        } catch (err) {
            console.warn('[DuckDbStore] Error building DF cache:', err.message);
        }
    }

    close() {
        if (this.con) {
            try { this.con.close(); } catch (e) {}
            this.con = null;
        }
        if (this.db) {
            try { this.db.close(); } catch (e) {}
            this.db = null;
        }
        this.initPromise = null;
        this.isInitialized = false;
    }
}

// Esportiamo un'istanza singola (Singleton)
const duckDbStore = new DuckDbStore();
module.exports = duckDbStore;
