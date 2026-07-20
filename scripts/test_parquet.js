const duckdb = require('duckdb');
const path = require('path');
const db = new duckdb.Database(':memory:');
const con = db.connect();
const pq = path.resolve('.cache/tmdb/movies.parquet').replace(/\\/g, '/');
console.log('Reading from:', pq);
con.all(`SELECT count(*) as count FROM read_parquet('${pq}')`, (err, res) => {
    if (err) console.error("Query Error:", err);
    else console.log("Success:", res);
});
