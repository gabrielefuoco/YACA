const duckdb = require('duckdb');
const db = new duckdb.Database(':memory:');
db.all("CREATE TABLE test (id INT, title VARCHAR, original_title VARCHAR);", (err) => {
    db.all("INSERT INTO test VALUES (1, 'Avengers Endgame', 'Avengers Endgame'), (2, 'Spider-Man', 'Spider-Man');", (err) => {
        db.all("INSTALL fts; LOAD fts;", (err) => {
            db.all("PRAGMA create_fts_index('test', 'id', 'title', 'original_title');", (err) => {
                db.all("SELECT id, title, fts_main_test.match_bm25(id, 'avengers') AS score FROM test WHERE fts_main_test.match_bm25(id, 'avengers') IS NOT NULL ORDER BY score DESC;", (err, res) => {
                    console.log(err || res);
                });
            });
        });
    });
});
