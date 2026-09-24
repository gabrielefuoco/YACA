const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONVERT_SCRIPT = path.resolve(__dirname, '../scripts/convert_to_parquet.js');

function writeJsonl(filePath, records) {
    fs.writeFileSync(filePath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

function runConversion(dataDir) {
    const result = spawnSync(process.execPath, [
        CONVERT_SCRIPT,
        '--data-dir', dataDir,
        '--type', 'movies'
    ], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    return `${result.stdout}\n${result.stderr}`;
}

function readParquet(dataDir) {
    const parquetFile = path.join(dataDir, 'movies.parquet');
    const script = `
        const duckdb = require('duckdb');
        const db = new duckdb.Database(':memory:');
        const con = db.connect();
        con.all('SELECT id::VARCHAR AS id, marker FROM read_parquet(?) ORDER BY id', [process.argv[1]], (error, rows) => {
            con.close(() => db.close(() => {
                if (error) { console.error(error); process.exitCode = 1; }
                else console.log(JSON.stringify(rows));
            }));
        });
    `;
    const result = spawnSync(process.execPath, ['-e', script, parquetFile], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout);
}

describe('TMDB dump hygiene', () => {
    let dataDir;

    beforeEach(() => {
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-dump-hygiene-'));
    });

    afterEach(() => {
        fs.rmSync(dataDir, { force: true, recursive: true });
    });

    test('la conversione conserva il record più recente per id e deduplica il parquet', () => {
        writeJsonl(path.join(dataDir, 'master_movies.jsonl'), [
            { _fetched_at: '2026-01-01T00:00:00.000Z', id: 1, marker: 'vecchio', popularity: 50 },
            { _fetched_at: '2026-01-02T00:00:00.000Z', id: 1, marker: 'recente', popularity: 10 },
            { id: 2, marker: 'senza data vecchio', popularity: 30 },
            { id: 2, marker: 'senza data ultimo', popularity: 20 },
            { _fetched_at: '2026-01-03T00:00:00.000Z', id: 3, marker: 'timestamp', popularity: 5 },
            { id: 3, marker: 'senza data ma successivo nel file', popularity: 40 }
        ]);

        const output = runConversion(dataDir);
        expect(output).toContain('3 righe, 3 id univoci, 3 duplicate rimosse');
        expect(readParquet(dataDir).map(({ marker }) => marker)).toEqual([
            'recente',
            'senza data ultimo',
            'timestamp'
        ]);
    });

    test('senza _fetched_at la conversione usa l’ultima occorrenza nel file', () => {
        writeJsonl(path.join(dataDir, 'master_movies.jsonl'), [
            { id: 7, marker: 'primo', popularity: 1 },
            { id: 7, marker: 'ultimo', popularity: 1 }
        ]);

        const output = runConversion(dataDir);
        expect(output).toContain('1 righe, 1 id univoci, 1 duplicate rimosse');
        expect(readParquet(dataDir)[0].marker).toBe('ultimo');
    });
});
