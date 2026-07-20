const duckdb = require('duckdb');
const db = new duckdb.Database(':memory:');
const con = db.connect();

const sql = `
CREATE TABLE test_table (id INT);
PRAGMA create_fts_index('test_table', 'id');
`;

con.exec(sql, (err) => {
    if (err) {
        console.error("Exec error:", err.message);
    } else {
        console.log("Success");
    }
});
