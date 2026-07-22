const duckdb = require('duckdb');
const db = new duckdb.Database(':memory:');

db.all("DESCRIBE SELECT * FROM 'movies.parquet'", function(err, res) {
    if (err) {
        console.error(err);
    } else {
        console.log(res);
    }
});
