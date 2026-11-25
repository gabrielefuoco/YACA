const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const duckdb = require('duckdb');

const TmdbDumpClient = require('../tmdbDumpClient');
const { findCompromisedIds } = require('../../../scripts/backfill-cjk-titles');

const { resolveIngestTitle } = TmdbDumpClient;

test('resolveIngestTitle: picks English title for non-Latin titles with an en translation', () => {
    const cases = [
        {
            lang: 'ko',
            isMovie: true,
            data: {
                title: '기생충',
                original_title: '기생충',
                original_language: 'ko',
                translations: {
                    translations: [
                        { iso_639_1: 'en', iso_3166_1: 'US', data: { title: 'Parasite' } }
                    ]
                }
            },
            expected: { title: 'Parasite', title_en: 'Parasite' }
        },
        {
            lang: 'ko (tv)',
            isMovie: false,
            data: {
                name: '오징어 게임',
                original_name: '오징어 게임',
                original_language: 'ko',
                translations: {
                    translations: [
                        { iso_639_1: 'en', iso_3166_1: 'US', data: { name: 'Squid Game' } }
                    ]
                }
            },
            expected: { title: 'Squid Game', title_en: 'Squid Game' }
        },
        {
            lang: 'ru',
            isMovie: true,
            data: {
                title: 'Иди и смотри',
                original_title: 'Иди и смотри',
                original_language: 'ru',
                translations: {
                    translations: [
                        { iso_639_1: 'en', iso_3166_1: 'US', data: { title: 'Come and See' } }
                    ]
                }
            },
            expected: { title: 'Come and See', title_en: 'Come and See' }
        },
        {
            lang: 'hi',
            isMovie: true,
            data: {
                title: 'दंगल',
                original_title: 'दंगल',
                original_language: 'hi',
                translations: {
                    translations: [
                        { iso_639_1: 'en', iso_3166_1: 'US', data: { title: 'Dangal' } }
                    ]
                }
            },
            expected: { title: 'Dangal', title_en: 'Dangal' }
        }
    ];

    for (const tc of cases) {
        const result = resolveIngestTitle(tc.data, tc.isMovie);
        assert.deepEqual(result, tc.expected, `failed for ${tc.lang}`);
    }
});

test('resolveIngestTitle: keeps original title when no en translation exists', () => {
    const cases = [
        {
            isMovie: true,
            data: {
                title: '무명 영화',
                original_title: '무명 영화',
                original_language: 'ko',
                translations: { translations: [] }
            },
            expected: { title: '무명 영화', title_en: null }
        },
        {
            isMovie: false,
            data: {
                name: 'Неизвестный сериал',
                original_name: 'Неизвестный сериал',
                original_language: 'ru',
                translations: {
                    translations: [
                        { iso_639_1: 'fr', iso_3166_1: 'FR', data: { name: 'Série inconnue' } }
                    ]
                }
            },
            expected: { title: 'Неизвестный сериал', title_en: null }
        },
        {
            isMovie: true,
            data: {
                title: 'अज्ञात फिल्म',
                original_title: 'अज्ञात फिल्म',
                original_language: 'hi',
                translations: { translations: [] }
            },
            expected: { title: 'अज्ञात फिल्म', title_en: null }
        }
    ];

    for (const tc of cases) {
        assert.deepEqual(resolveIngestTitle(tc.data, tc.isMovie), tc.expected);
    }
});

test('resolveIngestTitle: preserves Italian-first behaviour and Latin/digit titles', () => {
    const withItTranslation = resolveIngestTitle({
        title: 'Parasite',
        original_title: '기생충',
        original_language: 'ko',
        translations: {
            translations: [
                { iso_639_1: 'it', iso_3166_1: 'IT', data: { title: 'Parasite' } },
                { iso_639_1: 'en', iso_3166_1: 'US', data: { title: 'Parasite (US)' } }
            ]
        }
    }, true);
    assert.deepEqual(withItTranslation, { title: 'Parasite', title_en: 'Parasite (US)' });

    const nativeIt = resolveIngestTitle({
        title: 'La vita è bella',
        original_title: 'La vita è bella',
        original_language: 'it',
        translations: {
            translations: [
                { iso_639_1: 'en', iso_3166_1: 'US', data: { title: 'Life Is Beautiful' } }
            ]
        }
    }, true);
    assert.deepEqual(nativeIt, { title: 'La vita è bella', title_en: 'Life Is Beautiful' });

    const numericTitle = resolveIngestTitle({
        title: '2046',
        original_title: '2046',
        original_language: 'zh',
        translations: {
            translations: [
                { iso_639_1: 'en', iso_3166_1: 'US', data: { title: '2046 EN' } }
            ]
        }
    }, true);
    assert.deepEqual(numericTitle, { title: '2046', title_en: '2046 EN' });
});

test('findCompromisedIds: selects non-Latin rows across languages only when title_en/name_en exists', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-t13-backfill-'));
    const db = new duckdb.Database(':memory:');
    const con = db.connect();
    const exec = (sql) => new Promise((res, rej) => con.exec(sql, (err) => err ? rej(err) : res()));

    try {
        const moviesParquet = path.join(tmpDir, 'movies.parquet').replace(/\\/g, '/');
        const tvParquet = path.join(tmpDir, 'tv.parquet').replace(/\\/g, '/');

        await exec(`
            CREATE TABLE movies_test AS SELECT * FROM (VALUES
                (1, '기생충', 'Parasite', 'ko', 100.0, 5000),
                (2, 'Иди и смотри', 'Come and See', 'ru', 2.0, 10),
                (3, 'दंगल', NULL, 'hi', 50.0, 200),
                (4, 'अज्ञात', '   ', 'hi', 50.0, 200),
                (5, 'Oldboy', 'Oldboy', 'ko', 80.0, 4000),
                (6, '2046', '2046', 'zh', 20.0, 300)
            ) AS t(id, title, title_en, original_language, popularity, vote_count);
            COPY movies_test TO '${moviesParquet}' (FORMAT PARQUET);

            CREATE TABLE tv_test AS SELECT * FROM (VALUES
                (10, '오징어 게임', 'Squid Game', 'ko', 120.0, 3000),
                (11, '進撃の巨人', 'Attack on Titan', 'ja', 3.0, 20),
                (12, 'Слово пацана', NULL, 'ru', 40.0, 500)
            ) AS t(id, name, name_en, original_language, popularity, vote_count);
            COPY tv_test TO '${tvParquet}' (FORMAT PARQUET);
        `);

        await new Promise((res) => con.close(() => db.close(res)));

        const allMovies = await findCompromisedIds(tmpDir, 'movies', false);
        assert.deepEqual(allMovies.map(r => r.id), [1, 2]);

        const visibleMovies = await findCompromisedIds(tmpDir, 'movies', true);
        assert.deepEqual(visibleMovies.map(r => r.id), [1]);

        const allTv = await findCompromisedIds(tmpDir, 'tv', false);
        assert.deepEqual(allTv.map(r => r.id), [10, 11]);

        const visibleTv = await findCompromisedIds(tmpDir, 'tv', true);
        assert.deepEqual(visibleTv.map(r => r.id), [10]);
    } finally {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (_) {}
    }
});
