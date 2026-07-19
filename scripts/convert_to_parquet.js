const duckdb = require('duckdb');
const path = require('path');
const fs = require('fs');

const db = new duckdb.Database(':memory:');
const con = db.connect();

const jsonlFile = path.join(__dirname, '..', 'master_movies.jsonl');
const parquetFile = path.join(__dirname, '..', 'movies.parquet');

if (!fs.existsSync(jsonlFile)) {
    console.error(`[DuckDB Convert] JSONL file not found at ${jsonlFile}`);
    process.exit(1);
}

console.log(`[DuckDB Convert] Inizio conversione di ${jsonlFile} in Parquet...`);
console.log(`[DuckDB Convert] Questo processo ottimizzerà e comprimerà i dati usando ZSTD.`);
console.time('Tempo di conversione');

// Eseguiamo la query di copia nativa di DuckDB. 
// Usiamo read_json_auto per inferire automaticamente lo schema del JSONL.
const query = `
    COPY (
        SELECT * FROM read_json_auto('${jsonlFile.replace(/\\/g, '/')}')
    ) TO '${parquetFile.replace(/\\/g, '/')}' (FORMAT PARQUET, COMPRESSION 'ZSTD');
`;

con.exec(query, (err) => {
    if (err) {
        console.error('[DuckDB Convert] Errore critico durante la conversione:', err);
        process.exit(1);
    }
    console.timeEnd('Tempo di conversione');
    
    if (fs.existsSync(parquetFile)) {
        const stats = fs.statSync(parquetFile);
        console.log(`[DuckDB Convert] Successo! Creato ${parquetFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    // Chiudiamo il db
    process.exit(0);
});
