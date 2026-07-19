const duckdb = require('duckdb');
const path = require('path');
const fs = require('fs');

class DuckDbStore {
    constructor() {
        this.db = null;
        this.con = null;
        this.isInitialized = false;
        this.parquetPath = path.join(__dirname, '../../movies.parquet');
    }

    async init() {
        if (this.isInitialized) return;

        // In futuro: qui aggiungeremo la logica per scaricare il parquet dal Bucket 
        // se non esiste in locale, usando il demone / SDK HF.
        
        if (!fs.existsSync(this.parquetPath)) {
            console.warn(`[DuckDB Store] Attenzione: File ${this.parquetPath} non trovato.`);
            console.warn(`[DuckDB Store] DuckDB è avviato in memoria vuota. Per favore lancia scripts/convert_to_parquet.js`);
        }

        console.log(`[DuckDB Store] Inizializzazione in corso...`);
        
        return new Promise((resolve, reject) => {
            // Avvio con limite di memoria per sicurezza su HF
            this.db = new duckdb.Database(':memory:', { max_memory: '2GB' }, (err) => {
                if (err) return reject(err);
                
                this.con = this.db.connect();
                
                if (fs.existsSync(this.parquetPath)) {
                    // Creiamo una VIEW (Tabella Virtuale) che mappa direttamente il file Parquet
                    // Questo permette query istantanee senza caricare l'intero file in RAM
                    const createViewQuery = `
                        CREATE VIEW movies AS 
                        SELECT * FROM read_parquet('${this.parquetPath.replace(/\\/g, '/')}');
                    `;
                    
                    this.con.exec(createViewQuery, (errView) => {
                        if (errView) {
                            console.error(`[DuckDB Store] Errore creazione view:`, errView);
                            return reject(errView);
                        }
                        console.log(`[DuckDB Store] View 'movies' creata con successo mappando il Parquet.`);
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
            // Se non c'è la view (manca il file), ritorniamo vuoto per non far crashare l'app
            if (!fs.existsSync(this.parquetPath) && sql.includes('movies')) {
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
