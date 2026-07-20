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
        if (this.isInitialized) return;

        console.log(`[DuckDB Store] Inizializzazione in corso...`);
        if (!fs.existsSync(this.moviesParquetPath) && !fs.existsSync(this.tvParquetPath)) {
            console.warn(`[DuckDB Store] Attenzione: File Parquet non trovati in ${this.basePath}.`);
            console.warn(`[DuckDB Store] DuckDB è avviato in memoria vuota. Per favore attendi la fine del sync o lancia scripts/convert_to_parquet.js`);
        }
        
        return new Promise((resolve, reject) => {
            // Avvio con limite di memoria per sicurezza su HF
            this.db = new duckdb.Database(':memory:', { max_memory: '2GB' }, (err) => {
                if (err) return reject(err);
                
                this.con = this.db.connect();
                
                let commands = [
                    "INSTALL fts;",
                    "LOAD fts;"
                ];
                
                if (fs.existsSync(this.moviesParquetPath)) {
                    commands.push(`CREATE TABLE movies AS SELECT * FROM read_parquet('${this.moviesParquetPath.replace(/\\/g, '/')}');`);
                    commands.push(`PRAGMA create_fts_index('movies', 'id', 'title', 'original_title');`);
                }
                
                if (fs.existsSync(this.tvParquetPath)) {
                    commands.push(`CREATE TABLE tv AS SELECT * FROM read_parquet('${this.tvParquetPath.replace(/\\/g, '/')}');`);
                    commands.push(`PRAGMA create_fts_index('tv', 'id', 'title', 'original_title');`);
                }

                if (commands.length > 2) {
                    // commands contiene INSTALL e LOAD + le create table/index
                    const sql = commands.join('\n');
                    this.con.exec(sql, (errExec) => {
                        if (errExec) {
                            console.error(`[DuckDB Store] Errore inizializzazione tabelle/FTS:`, errExec);
                            return reject(errExec);
                        }
                        console.log(`[DuckDB Store] Tabelle caricate in RAM e indici FTS creati con successo.`);
                        this.isInitialized = true;
                        resolve();
                    });
                } else {
                    console.warn(`[DuckDB Store] Nessun Parquet da caricare in memoria. Avvio a vuoto completato.`);
                    this.isInitialized = true;
                    resolve();
                }
            });
        });
    }

    async updateAnimeMapping(tmdbIds) {
        if (!this.isInitialized) {
            console.warn('[DuckDB Store] DB non inizializzato, ignoro updateAnimeMapping.');
            return;
        }
        
        return new Promise((resolve, reject) => {
            let sql = `
                DROP TABLE IF EXISTS anime_mappings;
                CREATE TABLE anime_mappings (tmdb_id INTEGER PRIMARY KEY);
            `;
            
            if (tmdbIds && tmdbIds.length > 0) {
                // Generiamo una singola INSERT enorme, in memoria è rapidissimo
                const values = tmdbIds.map(id => `(${id})`).join(',');
                sql += `\nINSERT INTO anime_mappings VALUES ${values};`;
            }
            
            this.con.exec(sql, (err) => {
                if (err) {
                    console.error('[DuckDB Store] Errore aggiornamento tabella anime_mappings:', err);
                    return reject(err);
                }
                console.log(`[DuckDB Store] Tabella anime_mappings creata in RAM con ${tmdbIds ? tmdbIds.length : 0} anime certificati.`);
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
            if (sql.includes('movies') && !fs.existsSync(this.moviesParquetPath)) {
                return resolve([]); 
            }
            if (sql.includes('tv') && !fs.existsSync(this.tvParquetPath)) {
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
        if (this.con) this.con.close();
        if (this.db) this.db.close();
    }
}

// Esportiamo un'istanza singola (Singleton)
const duckDbStore = new DuckDbStore();
module.exports = duckDbStore;
