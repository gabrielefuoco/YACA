/**
 * tests/indice.test.js
 * 
 * TDD sui due seam del ticket 22 (prima metà):
 * (a) Il contratto dell'indice: filtri -> titoli attesi con fixture DuckDB in memoria
 * (b) Il compilatore: filtri -> query parametrizzata con valori nei parametri (nessun valore utente in SQL, escapeSqlString sparita)
 */

const duckdb = require('duckdb');
const indice = require('../src/indice');
const { IndiceModule } = require('../src/indice');
const { compileQuery } = require('../src/indice/compiler');
const compiler = require('../src/indice/compiler');
const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');

describe('Ticket 22 — Seam B: Il compilatore dell\'indice (filtri in, parametri out)', () => {
    test('escapeSqlString scompare dal compilatore dell indice', () => {
        expect(compiler.escapeSqlString).toBeUndefined();
    });

    test('la query FTS non interpola la stringa cercata nel testo SQL: i valori viaggiano in params', async () => {
        const query = await compileQuery({
            type: 'movie',
            where: [{ _fts: "d'azione" }]
        }, 0, 10);

        // Verifica che il valore utente NON sia interpolato in SQL
        expect(query.sql).not.toContain("d'azione");
        expect(query.sql).not.toContain("d''azione");
        expect(query.sql).toContain('fts_main_movies.match_bm25(id, ?)');
        expect(query.sql).toContain('LIMIT ? OFFSET ?');

        // Verifica che i parametri trasportino il valore intatto
        expect(query.params).toContain("d'azione");
        expect(query.params).toContain('%d%');
        expect(query.params).toContain('%azione%');
        expect(query.params).toContain(10); // limit
        expect(query.params).toContain(0);  // skip
    });

    test('la query multi-termine e boost esatto non interpolano parole in SQL', async () => {
        const query = await compileQuery({
            type: 'movie',
            where: [{ _fts: 'Spider-Man: No Way Home' }]
        }, 0, 20);

        expect(query.sql).not.toContain('Spider-Man');
        expect(query.sql).not.toContain('No Way Home');
        expect(query.sql).toContain('fts_main_movies.match_bm25(id, ?) IS NOT NULL');
        expect(query.sql).toContain('concat_ws');
        expect(query.sql).toContain('ILIKE ?');
        expect(query.sql).toContain('CASE WHEN lower(trim(coalesce(title, \'\'))) = lower(trim(?))');
        expect(query.sql).toContain('fts_main_movies.match_bm25(id, ?) DESC, id ASC');

        expect(query.params).toContain('Spider-Man: No Way Home');
        expect(query.params).toContain('%spider%');
        expect(query.params).toContain('%man%');
        expect(query.params).toContain(20);
        expect(query.params).toContain(0);
    });

    test('la clausola similar usa parametri posizionali per gli ID raccomandati', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValue([
                { recommendations: JSON.stringify([604, 605, 999]) }
            ])
        };

        const query = await compileQuery({
            type: 'movie',
            where: [{ _similar: true, tmdbId: 603 }]
        }, 0, 10, mockDb);

        expect(query.sql).toContain('id IN (?,?,?)');
        expect(query.sql).not.toContain('604,605');
        expect(query.params).toEqual(expect.arrayContaining([604, 605, 999, 10, 0]));
        expect(mockDb.query).toHaveBeenCalledWith(
            expect.stringContaining('SELECT recommendations FROM movies WHERE id = ?'),
            [603]
        );
    });

    test('garantisce tie-breaker deterministico id ASC e parametri LIMIT/OFFSET su uniqueById', async () => {
        const query = await compileQuery({
            type: 'tv',
            uniqueById: true,
            where: ['"vote_count" >= 50'],
            orderBy: 'popularity DESC'
        }, 20, 10);

        expect(query.sql).toContain('row_number() OVER (PARTITION BY id) AS __yaca_unique_row');
        expect(query.sql).toContain('ORDER BY popularity DESC, id ASC LIMIT ? OFFSET ?');
        expect(query.params).toEqual([10, 20]);
    });
});

describe('Ticket 22 — Seam A: Il contratto dell\'indice con fixture dedicata', () => {
    let testDb;
    let testCon;
    let testDuckStore;
    let testIndice;

    beforeAll(async () => {
        testDb = new duckdb.Database(':memory:');
        testCon = testDb.connect();

        const runSql = (sql) => new Promise((resolve, reject) => testCon.run(sql, err => err ? reject(err) : resolve()));

        await runSql('INSTALL fts;');
        await runSql('LOAD fts;');
        await runSql(`
            CREATE TABLE movies (
                id BIGINT,
                title VARCHAR,
                original_title VARCHAR,
                adult BOOLEAN,
                release_date VARCHAR,
                popularity DOUBLE,
                vote_count BIGINT,
                vote_average DOUBLE,
                genres VARCHAR,
                keywords VARCHAR,
                recommendations VARCHAR,
                poster_path VARCHAR,
                backdrop_path VARCHAR,
                original_language VARCHAR,
                overview VARCHAR
            );
        `);

        await runSql(`
            CREATE TABLE tv (
                id BIGINT,
                name VARCHAR,
                original_name VARCHAR,
                adult BOOLEAN,
                first_air_date VARCHAR,
                popularity DOUBLE,
                vote_count BIGINT,
                vote_average DOUBLE,
                genres VARCHAR,
                keywords VARCHAR,
                recommendations VARCHAR,
                poster_path VARCHAR,
                backdrop_path VARCHAR,
                original_language VARCHAR,
                overview VARCHAR
            );
        `);

        // Popolamento fixture minima
        await runSql(`
            INSERT INTO movies VALUES
            (603, 'The Matrix', 'The Matrix', false, '1999-03-31', 95.5, 23000, 8.2, '[{"id":28,"name":"Action"},{"id":878,"name":"Sci-Fi"}]', '[{"id":4379,"name":"cyberpunk"}]', '[604, 605]', '/matrix.jpg', '/matrix_bg.jpg', 'en', 'Welcome to the Real World'),
            (604, 'The Matrix Reloaded', 'The Matrix Reloaded', false, '2003-05-15', 70.0, 11000, 7.0, '[{"id":28,"name":"Action"},{"id":878,"name":"Sci-Fi"}]', '[]', '[]', '/reloaded.jpg', '/reloaded_bg.jpg', 'en', 'Neo returns'),
            (605, 'The Matrix Revolutions', 'The Matrix Revolutions', false, '2003-11-05', 60.0, 9500, 6.7, '[{"id":28,"name":"Action"},{"id":878,"name":"Sci-Fi"}]', '[]', '[]', '/revolutions.jpg', '/revolutions_bg.jpg', 'en', 'The epic conclusion'),
            (634649, 'Spider-Man: No Way Home', 'Spider-Man: No Way Home', false, '2021-12-15', 120.0, 18000, 8.0, '[{"id":28,"name":"Action"}]', '[]', '[]', '/spiderman.jpg', '/spiderman_bg.jpg', 'en', 'Peter Parker identity revealed');
        `);

        await runSql("PRAGMA create_fts_index('movies', 'id', 'title', 'original_title');");
        await runSql("PRAGMA create_fts_index('tv', 'id', 'name', 'original_name');");

        testDuckStore = {
            isInitialized: true,
            _isDatabaseFresh: () => true,
            query: (sql, params = []) => new Promise((resolve, reject) => {
                testCon.all(sql, ...params, (err, rows) => err ? reject(err) : resolve(rows));
            }),
            init: async () => {},
            close: (cb) => {
                testCon.close(() => {
                    testDb.close(() => { if (cb) cb(); });
                });
            }
        };

        testIndice = new IndiceModule({
            duckDb: testDuckStore,
            tier2Client: {
                search: jest.fn().mockReturnValue([
                    { id: '950387', type: 'movie', title: 'Coda Lunga Export', original_title: 'Coda Lunga Export' }
                ]),
                init: jest.fn().mockReturnValue(true),
                close: jest.fn()
            }
        });
    });

    afterAll(async () => {
        await new Promise(r => testIndice.close(r));
    });

    test('contratto: getTitles risponde con i titoli che soddisfano i filtri in ordine', async () => {
        const titles = await testIndice.getTitles({
            type: 'movie',
            where: ['"vote_count" >= 10000'],
            orderBy: 'popularity DESC'
        });

        expect(Array.isArray(titles)).toBe(true);
        expect(titles.length).toBe(3);
        // Ordinamento per popolarità decrescente: Spider-Man (120), Matrix (95.5), Reloaded (70)
        expect(titles.map(t => Number(t.id))).toEqual([634649, 603, 604]);
    });

    test('contratto: search testuale esegue FTS BM25 ed esalta il match esatto per primo', async () => {
        const results = await testIndice.search('Spider-Man: No Way Home', { type: 'movie', limit: 10 });
        expect(results.length).toBeGreaterThan(0);
        expect(Number(results[0].id)).toBe(634649);
        expect(results[0].title).toBe('Spider-Man: No Way Home');
    });

    test('contratto: search con query "Matrix" ordina per rilevanza e tie-breaker', async () => {
        const matrixTitles = await testIndice.search('Matrix', { type: 'movie', limit: 10 });
        expect(matrixTitles.length).toBe(3);
        expect(matrixTitles.map(t => Number(t.id))).toEqual([603, 604, 605]);
    });

    test('contratto: getById recupera il record grezzo senza interpolazione SQL', async () => {
        const item = await testIndice.getById('tmdb:603', 'movie');
        expect(item).not.toBeNull();
        expect(Number(item.id)).toBe(603);
        expect(item.title).toBe('The Matrix');
    });

    test('contratto: searchTier2 interroga la coda lunga FTS5', () => {
        const tier2Res = testIndice.searchTier2('coda lunga', { type: 'movie', limit: 5 });
        expect(tier2Res).toHaveLength(1);
        expect(tier2Res[0].title).toBe('Coda Lunga Export');
    });

    test('DuckDbProvider come CLIENT dell indice: produce Stremio Light Meta dai titoli dell indice', async () => {
        // Configuriamo DuckDbProvider per consumare il testIndice
        const originalIndice = DuckDbProvider.__testIndice;
        // Mock getTitles su indice globale
        const getTitlesSpy = jest.spyOn(indice, 'getTitles').mockImplementation((preset, opts) => {
            return testIndice.getTitles(preset, opts);
        });
        const getByIdSpy = jest.spyOn(indice, 'getById').mockImplementation((id, type) => {
            return testIndice.getById(id, type);
        });

        // 1. Client Catalogo da Preset
        const catalogItems = await DuckDbProvider.getDuckDbCatalogFromPreset({
            type: 'movie',
            where: ['"vote_count" >= 10000'],
            orderBy: 'popularity DESC'
        });

        expect(catalogItems.length).toBe(3);
        expect(catalogItems[0].id).toBe('tmdb:634649');
        expect(catalogItems[0].name).toBe('Spider-Man: No Way Home');
        expect(catalogItems[0].poster).toContain('/spiderman.jpg');
        expect(catalogItems[0].rawTMDB).toBeDefined();

        // 2. Client Meta Details da ID
        const metaDetail = await DuckDbProvider.getDuckDbMetaDetails('tmdb:603', 'movie');
        expect(metaDetail).not.toBeNull();
        expect(metaDetail.id).toBe('tmdb:603');
        expect(metaDetail.name).toBe('The Matrix');
        expect(metaDetail.releaseInfo).toBe('1999');

        getTitlesSpy.mockRestore();
        getByIdSpy.mockRestore();
    });
});
