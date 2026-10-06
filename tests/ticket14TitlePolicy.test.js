/**
 * ticket14TitlePolicy.test.js
 *
 * Test di unità e integrazione per il Ticket 14:
 * Opzione A — Titoli anime nel dump: policy IT -> EN -> JA a monte + retrocompatibilità parquet.
 */

const axios = require('axios');
const duckdb = require('duckdb');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TmdbDumpClient = require('../src/utils/tmdbDumpClient');
const duckDbStore = require('../src/db/duckDbStore');
const { mapDuckDbRowToMeta } = require('../src/catalog/providers/DuckDbProvider');
const { sanitizeCatalogMeta } = require('../src/catalog/formatters/StremioFormatter');

describe('Ticket 14: Policy IT -> EN -> JA nel dump TMDB e DuckDB Provider', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('TmdbDumpClient: append_to_response e policy IT -> EN -> JA in ingestione', () => {
        test('fetchMovie include "translations" in append_to_response', async () => {
            const client = new TmdbDumpClient('test-key');
            let calledParams = null;
            jest.spyOn(axios, 'get').mockImplementation((url, config) => {
                calledParams = config.params;
                return Promise.resolve({
                    data: {
                        id: 100,
                        title: 'Test Movie',
                        original_title: 'Test Movie',
                        original_language: 'en',
                        vote_count: 50,
                        popularity: 10
                    }
                });
            });

            await client.fetchMovie(100);
            expect(calledParams).toBeDefined();
            expect(calledParams.append_to_response).toContain('translations');
        });

        test('fetchTv include "translations" in append_to_response', async () => {
            const client = new TmdbDumpClient('test-key');
            let calledParams = null;
            jest.spyOn(axios, 'get').mockImplementation((url, config) => {
                calledParams = config.params;
                return Promise.resolve({
                    data: {
                        id: 200,
                        name: 'Test TV',
                        original_name: 'Test TV',
                        original_language: 'en',
                        vote_count: 50,
                        popularity: 10
                    }
                });
            });

            await client.fetchTv(200);
            expect(calledParams).toBeDefined();
            expect(calledParams.append_to_response).toContain('translations');
        });

        test('fetchTv applica IT -> EN -> JA per anime senza traduzione italiana (fallita in CJK)', async () => {
            const client = new TmdbDumpClient('test-key');
            jest.spyOn(axios, 'get').mockResolvedValue({
                data: {
                    id: 1429,
                    name: '進撃の巨人',
                    original_name: '進撃の巨人',
                    original_language: 'ja',
                    vote_count: 100,
                    popularity: 50,
                    translations: {
                        translations: [
                            {
                                iso_639_1: 'en',
                                iso_3166_1: 'US',
                                data: { name: 'Attack on Titan' }
                            },
                            {
                                iso_639_1: 'fr',
                                iso_3166_1: 'FR',
                                data: { name: "L'Attaque des Titans" }
                            }
                        ]
                    }
                }
            });

            const row = await client.fetchTv(1429);
            expect(row).toBeDefined();
            expect(row.name_en).toBe('Attack on Titan');
            expect(row.name).toBe('Attack on Titan'); // Policy IT -> EN -> JA
            expect(row.original_name).toBe('進撃の巨人'); // Originale preservato intatto
        });

        test('fetchMovie applica IT -> EN -> JA per film anime senza traduzione italiana', async () => {
            const client = new TmdbDumpClient('test-key');
            jest.spyOn(axios, 'get').mockResolvedValue({
                data: {
                    id: 378064,
                    title: '映画 聲の形',
                    original_title: '映画 聲の形',
                    original_language: 'ja',
                    vote_count: 200,
                    popularity: 30,
                    translations: {
                        translations: [
                            {
                                iso_639_1: 'en',
                                iso_3166_1: 'US',
                                data: { title: 'A Silent Voice: The Movie' }
                            }
                        ]
                    }
                }
            });

            const row = await client.fetchMovie(378064);
            expect(row).toBeDefined();
            expect(row.title_en).toBe('A Silent Voice: The Movie');
            expect(row.title).toBe('A Silent Voice: The Movie'); // Policy IT -> EN -> JA
            expect(row.original_title).toBe('映画 聲の形');
        });

        test('fetchTv mantiene il titolo italiano se presente', async () => {
            const client = new TmdbDumpClient('test-key');
            jest.spyOn(axios, 'get').mockResolvedValue({
                data: {
                    id: 1429,
                    name: "L'attacco dei giganti",
                    original_name: '進撃の巨人',
                    original_language: 'ja',
                    vote_count: 100,
                    popularity: 50,
                    translations: {
                        translations: [
                            {
                                iso_639_1: 'it',
                                iso_3166_1: 'IT',
                                data: { name: "L'attacco dei giganti" }
                            },
                            {
                                iso_639_1: 'en',
                                iso_3166_1: 'US',
                                data: { name: 'Attack on Titan' }
                            }
                        ]
                    }
                }
            });

            const row = await client.fetchTv(1429);
            expect(row.name).toBe("L'attacco dei giganti");
            expect(row.name_en).toBe('Attack on Titan');
            expect(row.original_name).toBe('進撃の巨人');
        });

        test('fetchTv cade su JA (original_name) se mancano sia IT che EN', async () => {
            const client = new TmdbDumpClient('test-key');
            jest.spyOn(axios, 'get').mockResolvedValue({
                data: {
                    id: 99999,
                    name: '無名のアニメ',
                    original_name: '無名のアニメ',
                    original_language: 'ja',
                    vote_count: 50,
                    popularity: 5,
                    translations: {
                        translations: []
                    }
                }
            });

            const row = await client.fetchTv(99999);
            expect(row.name_en).toBeNull();
            expect(row.name).toBe('無名のアニメ');
            expect(row.original_name).toBe('無名のアニメ');
        });

        test('per titoli nativamente inglesi (original_language = en), valorizza title_en/name_en', async () => {
            const client = new TmdbDumpClient('test-key');
            jest.spyOn(axios, 'get').mockResolvedValue({
                data: {
                    id: 603,
                    title: 'The Matrix',
                    original_title: 'The Matrix',
                    original_language: 'en',
                    vote_count: 500,
                    popularity: 50,
                    translations: { translations: [] }
                }
            });

            const row = await client.fetchMovie(603);
            expect(row.title).toBe('The Matrix');
            expect(row.title_en).toBe('The Matrix');
            expect(row.original_title).toBe('The Matrix');
        });
    });

    describe('Retrocompatibilità DuckDbStore con parquet senza le nuove colonne', () => {
        let tempDir;
        let testDb;

        beforeAll(async () => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-test-parquet-retro-'));
            const moviesParquet = path.join(tempDir, 'movies.parquet');
            const tvParquet = path.join(tempDir, 'tv.parquet');

            // Creiamo Parquet di vecchio schema (SENZA title_en e SENZA name_en)
            testDb = new duckdb.Database(':memory:');
            const con = testDb.connect();
            const exec = (s) => new Promise((res, rej) => con.exec(s, (e) => e ? rej(e) : res()));

            await exec(`
                CREATE TABLE legacy_movies AS SELECT
                    1 AS id,
                    '進撃の巨人' AS title,
                    '進撃の巨人' AS original_title,
                    'overview' AS overview,
                    'ja' AS original_language,
                    10.0 AS popularity,
                    100 AS vote_count,
                    '[]' AS genres,
                    '[]' AS keywords;
                COPY legacy_movies TO '${moviesParquet.replace(/\\/g, '/')}' (FORMAT PARQUET);
            `);

            await exec(`
                CREATE TABLE legacy_tv AS SELECT
                    2 AS id,
                    '進撃の巨人' AS name,
                    '進撃の巨人' AS original_name,
                    'overview' AS overview,
                    'ja' AS original_language,
                    20.0 AS popularity,
                    200 AS vote_count,
                    '[]' AS genres,
                    '[]' AS keywords;
                COPY legacy_tv TO '${tvParquet.replace(/\\/g, '/')}' (FORMAT PARQUET);
            `);

            con.close();
        });

        afterAll(() => {
            testDb.close();
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (e) {}
        });

        test('DuckDB store inizializza senza errori da parquet privi di title_en/name_en e garantisce le colonne', async () => {
            // Simuliamo DuckDbStore che carica i file del vecchio parquet
            const testStore = new (duckDbStore.constructor)();
            testStore.moviesParquetPath = path.join(tempDir, 'movies.parquet');
            testStore.tvParquetPath = path.join(tempDir, 'tv.parquet');

            await testStore.init();

            // Verifichiamo che SELECT title_en da movies e name_en da tv NON falliscano
            const movies = await testStore.query('SELECT id, title, title_en, original_title FROM movies WHERE id = 1');
            expect(movies).toHaveLength(1);
            expect(movies[0].title).toBe('進撃の巨人');
            expect(movies[0].title_en).toBeNull();

            const tv = await testStore.query('SELECT id, name, name_en, original_name FROM tv WHERE id = 2');
            expect(tv).toHaveLength(1);
            expect(tv[0].name).toBe('進撃の巨人');
            expect(tv[0].name_en).toBeNull();

            testStore.close();
        });
    });

    describe('DuckDbProvider: mapDuckDbRowToMeta e StremioFormatter', () => {
        test('quando title_en è presente, mapDuckDbRowToMeta sostituisce CJK con titolo inglese', () => {
            const metaMovie = mapDuckDbRowToMeta({
                id: 10,
                title: '映画 聲の形',
                title_en: 'A Silent Voice: The Movie',
                original_title: '映画 聲の形',
                original_language: 'ja'
            }, true);

            expect(metaMovie.name).toBe('A Silent Voice: The Movie');

            const metaTv = mapDuckDbRowToMeta({
                id: 20,
                name: '進撃の巨人',
                name_en: 'Attack on Titan',
                original_name: '進撃の巨人',
                original_language: 'ja'
            }, false);

            expect(metaTv.name).toBe('Attack on Titan');
        });

        test('quando title_en è assente (vecchio parquet), mapDuckDbRowToMeta non crasha e usa title/name', () => {
            const meta = mapDuckDbRowToMeta({
                id: 30,
                name: '進撃の巨人',
                original_name: '進撃の巨人',
                original_language: 'ja'
            }, false);

            expect(meta.name).toBe('進撃の巨人');
        });

        test('titolo italiano non-CJK viene preservato prioritariamente', () => {
            const meta = mapDuckDbRowToMeta({
                id: 40,
                name: "L'attacco dei giganti",
                name_en: 'Attack on Titan',
                original_name: '進撃の巨人',
                original_language: 'ja'
            }, false);

            expect(meta.name).toBe("L'attacco dei giganti");
        });

        test('StremioFormatter riceve il nome corretto prima di _rawName e parsa i badge episodio', () => {
            const meta = mapDuckDbRowToMeta({
                id: 50,
                name: '進撃の巨人 Season 2',
                name_en: 'Attack on Titan Season 2',
                original_name: '進撃の巨人 Season 2',
                original_language: 'ja',
                poster_path: '/poster.jpg'
            }, false);

            expect(meta.name).toBe('Attack on Titan Season 2');

            // Con id kitsu verifica che il badge S2 venga estratto dal titolo inglese "Season 2"
            const kitsuMeta = { ...meta, id: 'kitsu:123' };
            const formatted = sanitizeCatalogMeta(kitsuMeta, {
                shouldApplyEpisodeBadge: true,
                hostUrl: 'http://localhost:7000'
            });
            expect(formatted.name).toBe('Attack on Titan');
            expect(formatted.poster).toContain('tlBadge=S2');
            expect(formatted._rawName).toBe('Attack on Titan');
        });
    });
});
