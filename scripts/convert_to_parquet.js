const duckdb = require('duckdb');
const path = require('path');
const fs = require('fs');

const db = new duckdb.Database(':memory:');
const con = db.connect();

const basePath = fs.existsSync('/data') 
    ? '/data/tmdb' 
    : path.resolve(__dirname, '../.cache/tmdb');

const types = ['movies', 'tv'];

async function convert() {
    console.log(`[DuckDB Convert] Avvio conversione JSONL in Parquet (ZSTD)...`);
    console.time('Tempo totale conversione');

    for (const type of types) {
        const jsonlFile = path.join(basePath, `master_${type}.jsonl`);
        const parquetFile = path.join(basePath, `${type}.parquet`);

        if (!fs.existsSync(jsonlFile)) {
            console.warn(`[DuckDB Convert] JSONL per ${type} non trovato: ${jsonlFile}`);
            continue;
        }

        console.log(`[DuckDB Convert] Copia di ${type}...`);
        
        // Usiamo read_json_auto per inferire automaticamente lo schema del JSONL.
        const query = `
            COPY (
                SELECT * FROM read_json_auto('${jsonlFile.replace(/\\/g, '/')}')
            ) TO '${parquetFile.replace(/\\/g, '/')}' (FORMAT PARQUET, COMPRESSION 'ZSTD');
        `;

        try {
            await new Promise((resolve, reject) => {
                con.exec(query, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });

            if (fs.existsSync(parquetFile)) {
                const stats = fs.statSync(parquetFile);
                console.log(`[DuckDB Convert] ✅ Successo: ${type}.parquet creato (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            }
        } catch (err) {
            console.error(`[DuckDB Convert] ❌ Errore durante conversione ${type}:`, err);
        }
    }

    console.timeEnd('Tempo totale conversione');
    db.close();
    process.exit(0);
}

convert();
