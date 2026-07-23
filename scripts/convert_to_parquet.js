const duckdb = require('duckdb');
const path = require('path');
const fs = require('fs');

const db = new duckdb.Database(':memory:');
const con = db.connect();

const basePath = fs.existsSync('/data') 
    ? '/data/tmdb' 
    : path.resolve(__dirname, '../.cache/tmdb');

const types = ['movies', 'tv'];
let hasError = false;

async function convert() {
    console.log(`[DuckDB Convert] Avvio conversione JSONL in Parquet (ZSTD)...`);
    console.time('Tempo totale conversione');

    try {
        console.log(`[DuckDB Convert] Esecuzione fix generi italiani in JSONL...`);
        require('child_process').execSync(`node ${path.join(__dirname, 'fix_jsonl_genres.js')}`);
    } catch (e) {
        console.warn(`[DuckDB Convert] Warning: fix_jsonl_genres fallito`, e.message);
    }

    for (const type of types) {
        const jsonlFile = path.join(basePath, `master_${type}.jsonl`);
        const parquetFile = path.join(basePath, `${type}.parquet`);

        if (!fs.existsSync(jsonlFile)) {
            console.warn(`[DuckDB Convert] JSONL per ${type} non trovato: ${jsonlFile}`);
            continue;
        }

        const tmpParquetFile = path.join(basePath, `${type}_tmp.parquet`);

        console.log(`[DuckDB Convert] Copia di ${type}...`);
        
        const query = `
            COPY (
                SELECT * FROM read_json_auto('${jsonlFile.replace(/\\/g, '/')}') ORDER BY popularity DESC
            ) TO '${tmpParquetFile.replace(/\\/g, '/')}' (FORMAT PARQUET, COMPRESSION 'ZSTD');
        `;

        try {
            await new Promise((resolve, reject) => {
                con.exec(query, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });

            if (fs.existsSync(tmpParquetFile)) {
                // Sostituzione atomica per evitare file corrompi in lettura
                fs.renameSync(tmpParquetFile, parquetFile);
                const stats = fs.statSync(parquetFile);
                console.log(`[DuckDB Convert] ✅ Successo: ${type}.parquet aggiornato (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            }
        } catch (err) {
            console.error(`[DuckDB Convert] ❌ Errore durante conversione ${type}:`, err);
            if (fs.existsSync(tmpParquetFile)) fs.unlinkSync(tmpParquetFile);
            hasError = true;
        }
    }

    console.timeEnd('Tempo totale conversione');
    db.close();
    process.exit(hasError ? 1 : 0);
}

convert();
