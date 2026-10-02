const fs = require('fs');
const path = require('path');
const os = require('os');
const duckdb = require('duckdb');
const {
    buildTier2,
    sanitizeFts5Query,
    Tier2SearchClient,
    getTier2Stats
} = require('../src/db/tier2Index');

function runDuckDb(con, sql) {
    return new Promise((resolve, reject) => {
        con.run(sql, (err) => err ? reject(err) : resolve());
    });
}

describe('Tier 2 SQLite FTS5 + Parquet Index', () => {
    let tempDir;

    beforeAll(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-tier2-test-'));

        // Crea fixture Parquet piccole e controllate per film e serie
        const ddb = new duckdb.Database(':memory:');
        const con = ddb.connect();

        const moviesPath = path.join(tempDir, 'movies.parquet').replace(/\\/g, '/');
        const tvPath = path.join(tempDir, 'tv.parquet').replace(/\\/g, '/');

        await runDuckDb(con, `
            CREATE TABLE src_movies AS SELECT * FROM (
                VALUES 
                    (101, 'Spider-Man', 'Spider-Man', 125.5, '2002-05-01'),
                    (102, 'Batman Begins', 'Batman Begins', 98.2, '2005-06-15'),
                    (103, 'Fast & Furious 9', 'F9', 85.0, '2021-05-19'),
                    (104, 'Detective Conan: The Movie', 'Meitantei Conan', 45.0, '1997-04-19'),
                    (105, 'Resident Evil: Apocalypse', 'Resident Evil: Apocalypse', 60.0, '2004-09-10')
            ) AS t(id, title, original_title, popularity, release_date);
            COPY src_movies TO '${moviesPath}' (FORMAT PARQUET);
        `);

        await runDuckDb(con, `
            CREATE TABLE src_tv AS SELECT * FROM (
                VALUES 
                    (201, 'Spider-Man: The Animated Series', 'Spider-Man', 75.0, '1994-11-19'),
                    (202, 'Batman: Caped Crusader', 'Batman: Caped Crusader', 65.0, '2024-08-01'),
                    (203, 'Detective Conan', 'Meitantei Conan', 90.0, '1996-01-08')
            ) AS t(id, name, original_name, popularity, first_air_date);
            COPY src_tv TO '${tvPath}' (FORMAT PARQUET);
        `);

        await new Promise(r => con.close(() => ddb.close(() => r())));
    });

    afterAll(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (_) {}
        }
    });

    describe('sanitizeFts5Query', () => {
        it('gestisce query vuote o non stringhe senza errori', () => {
            expect(sanitizeFts5Query(null)).toBe('');
            expect(sanitizeFts5Query(undefined)).toBe('');
            expect(sanitizeFts5Query('')).toBe('');
            expect(sanitizeFts5Query('   ')).toBe('');
            expect(sanitizeFts5Query(123)).toBe('');
        });

        it('filtra parole chiave booleane FTS5 riservate', () => {
            expect(sanitizeFts5Query('spider AND man')).toBe('"spider" "man"*');
            expect(sanitizeFts5Query('batman NOT robin')).toBe('"batman" "robin"*');
            expect(sanitizeFts5Query('fast OR furious')).toBe('"fast" "furious"*');
            expect(sanitizeFts5Query('NEAR conan')).toBe('"conan"*');
        });

        it('rimuove caratteri speciali e punteggiatura che romperebbero FTS5', () => {
            expect(sanitizeFts5Query('fast & furious')).toBe('"fast" "furious"*');
            expect(sanitizeFts5Query('resident evil: apocalypse!')).toBe('"resident" "evil" "apocalypse"*');
            expect(sanitizeFts5Query('spider-man (2002)?')).toBe('"spider" "man" "2002"*');
            expect(sanitizeFts5Query('??? *** ---')).toBe('');
        });

        it('supporta caratteri unicode e accenti', () => {
            const query = 'Città di Dio';
            const sanitized = sanitizeFts5Query(query);
            expect(sanitized).toBe('"Città" "di" "Dio"*');
        });
    });

    describe('buildTier2', () => {
        it('costruisce con successo sia il parquet Tier 2 che titles_fts5.db', async () => {
            const result = await buildTier2({ dataDir: tempDir, exportDir: false });

            expect(result.success).toBe(true);
            expect(result.count).toBe(8); // 5 movies + 3 tv
            expect(fs.existsSync(result.parquetFile)).toBe(true);
            expect(fs.existsSync(result.dbFile)).toBe(true);
            expect(result.parquetSizeBytes).toBeGreaterThan(0);
            expect(result.dbSizeBytes).toBeGreaterThan(0);
            expect(result.durationMs).toBeGreaterThan(0);

            const stats = getTier2Stats({ dataDir: tempDir });
            expect(stats.dbExists).toBe(true);
            expect(stats.dbRows).toBe(8);
            expect(stats.parquetExists).toBe(true);
        });

        it('è idempotente: una seconda esecuzione non duplica i record', async () => {
            const res1 = await buildTier2({ dataDir: tempDir, exportDir: false });
            expect(res1.count).toBe(8);

            const res2 = await buildTier2({ dataDir: tempDir, exportDir: false });
            expect(res2.count).toBe(8);

            const stats = getTier2Stats({ dataDir: tempDir });
            expect(stats.dbRows).toBe(8);
        });

        it('in caso di errore nel sorgente, il Tier 2 precedente resta valido e intatto', async () => {
            // Verifica che il DB precedente sia presente e contenga 8 record
            const statsPrima = getTier2Stats({ dataDir: tempDir });
            expect(statsPrima.dbRows).toBe(8);

            const badParquetPath = path.join(tempDir, 'non_existent.parquet');

            await expect(buildTier2({
                dataDir: tempDir,
                sourceParquet: badParquetPath
            })).rejects.toThrow();

            // Il DB e il parquet precedenti devono rimanere esattamente intatti
            const statsDopo = getTier2Stats({ dataDir: tempDir });
            expect(statsDopo.dbExists).toBe(true);
            expect(statsDopo.dbRows).toBe(8);
            expect(statsDopo.parquetExists).toBe(true);
        });
    });

    describe('Tier2SearchClient', () => {
        let client;

        beforeAll(() => {
            const dbFile = path.join(tempDir, 'titles_fts5.db');
            client = new Tier2SearchClient({ dbPath: dbFile, readOnly: true });
        });

        afterAll(() => {
            if (client) client.close();
        });

        it('trova titoli tramite termine singolo con prefisso', () => {
            const results = client.search('spid');
            expect(results.length).toBe(2);
            expect(results.map(r => r.title)).toContain('Spider-Man');
            expect(results.map(r => r.title)).toContain('Spider-Man: The Animated Series');
        });

        it('trova titoli tramite query complessa con caratteri speciali', () => {
            const results = client.search('fast & furious');
            expect(results.length).toBe(1);
            expect(results[0].title).toBe('Fast & Furious 9');
            expect(results[0].type).toBe('movie');
        });

        it('trova titoli tramite original_title', () => {
            const results = client.search('Meitantei');
            expect(results.length).toBe(2);
            expect(results.map(r => r.title)).toContain('Detective Conan');
            expect(results.map(r => r.title)).toContain('Detective Conan: The Movie');
        });

        it('filtra correttamente per media_type', () => {
            const moviesOnly = client.search('spider', { type: 'movie' });
            expect(moviesOnly.length).toBe(1);
            expect(moviesOnly[0].type).toBe('movie');
            expect(moviesOnly[0].title).toBe('Spider-Man');

            const tvOnly = client.search('spider', { type: 'tv' });
            expect(tvOnly.length).toBe(1);
            expect(tvOnly[0].type).toBe('tv');
            expect(tvOnly[0].title).toBe('Spider-Man: The Animated Series');
        });

        it('rispetta il limite di risultati', () => {
            const results = client.search('conan', { limit: 1 });
            expect(results.length).toBe(1);
        });

        it('restituisce un array vuoto se la query non matcha nulla', () => {
            const results = client.search('questotitolononesisteassolutamente12345');
            expect(results).toEqual([]);
        });
    });
});

describe('buildExportSelect (sorgente Tier 2 = daily export)', () => {
    const { buildExportSelect } = require('../src/db/tier2Index');

    it('legge i campi dell export: original_title per i film, original_name per le serie', () => {
        const sql = buildExportSelect('/tmp/movie_ids_01_02_2026.json.gz', '/tmp/tv_series_ids_01_02_2026.json.gz');
        expect(sql).toContain('original_title');
        expect(sql).toContain('original_name');
        expect(sql).toContain("'movie' AS type");
        expect(sql).toContain("'tv' AS type");
        // L'export non ha i titoli localizzati né la data: la colonna resta vuota, dichiaratamente.
        expect(sql).toContain('CAST(NULL AS VARCHAR) AS release_date');
        // I film per adulti restano fuori.
        expect(sql).toContain('adult');
    });

    it('funziona con una sola sorgente (export parziale)', () => {
        const soloFilm = buildExportSelect('/tmp/movie_ids.json.gz', null);
        expect(soloFilm).toContain("'movie' AS type");
        expect(soloFilm).not.toContain("'tv' AS type");
        expect(soloFilm).not.toContain('UNION ALL');
    });
});
