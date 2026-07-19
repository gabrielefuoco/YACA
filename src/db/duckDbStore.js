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
                
                let viewsToCreate = [];
                if (fs.existsSync(this.moviesParquetPath)) {
                    viewsToCreate.push(`CREATE VIEW movies AS SELECT * FROM read_parquet('${this.moviesParquetPath.replace(/\\/g, '/')}');`);
                }
                
                if (fs.existsSync(this.tvParquetPath)) {
                    viewsToCreate.push(`CREATE VIEW tv AS SELECT * FROM read_parquet('${this.tvParquetPath.replace(/\\/g, '/')}');`);
                }

                if (viewsToCreate.length > 0) {
                    this.con.exec(viewsToCreate.join('\n'), (errView) => {
                        if (errView) {
                            console.error(`[DuckDB Store] Errore creazione view:`, errView);
                            return reject(errView);
                        }
                        console.log(`[DuckDB Store] View create con successo: ${viewsToCreate.length} file Parquet mappati.`);
                        this.isInitialized = true;
                        resolve();
                    });
                } else {
                    this.isInitialized = true;
                    resolve();
                }
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
