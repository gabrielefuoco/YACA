const duckdb = require('duckdb');
const path = require('path');
const fs = require('fs');

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
                        this.isInitialized = true;
                        
                        // Assicuriamoci di importare i mapping anime se sono già stati scaricati
                        const animeMappingStore = require('../data/animeMappingStore');
                        if (animeMappingStore.tmdbToAnimeNode && animeMappingStore.tmdbToAnimeNode.size > 0) {
                            const allTmdbAnimeIds = Array.from(animeMappingStore.tmdbToAnimeNode.keys());
                            this.updateAnimeMapping(allTmdbAnimeIds).catch(e => console.error('[DuckDB Store] Errore updateAnimeMapping post-init:', e));
                        }

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
