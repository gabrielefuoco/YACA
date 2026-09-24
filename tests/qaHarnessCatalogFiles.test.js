const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildCatalogFileName } = require('../scripts/qa/lib/fetch');
const { runReview } = require('../scripts/qa/lib/review');
const { runCompare } = require('../scripts/qa/lib/compare');

function rawCatalogDocument(type, year) {
    const isMovie = type === 'movie';
    return {
        profileId: 'sim_prof_harness',
        catalog: {
            id: 'yaca_search_standard',
            baseId: 'yaca_search_standard',
            type,
            name: `Search ${type}`
        },
        mode: 'fresh',
        fetchedAt: '2026-09-24T00:00:00.000Z',
        baseUrl: 'http://127.0.0.1:7025',
        pages: [{ skip: 0, httpStatus: 200, count: 1, error: null }],
        rawPages: [{
            skip: 0,
            data: {
                metas: [{
                    id: isMovie ? 'tmdb:100' : 'tmdb:200',
                    type,
                    name: isMovie ? 'Movie result' : 'Series result',
                    releaseInfo: String(year)
                }]
            }
        }]
    };
}

function writeFixtureRun(root, name) {
    const runDir = path.join(root, name);
    const rawDir = path.join(runDir, 'raw', 'sim_prof_harness');
    fs.mkdirSync(rawDir, { recursive: true });
    for (const type of ['movie', 'series']) {
        const catalog = { id: 'yaca_search_standard', type };
        fs.writeFileSync(
            path.join(rawDir, buildCatalogFileName(catalog)),
            JSON.stringify(rawCatalogDocument(type, 2024))
        );
    }
    fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({ mode: 'fresh', gitRev: 'test' }));
    return runDir;
}

describe('QA harness catalog files', () => {
    let tempRoot;

    beforeEach(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-qa-files-'));
    });

    afterEach(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    it('uses distinct filenames for the same catalog id and different types', () => {
        const movie = buildCatalogFileName({ id: 'yaca_search_standard', type: 'movie' });
        const series = buildCatalogFileName({ id: 'yaca_search_standard', type: 'series' });

        expect(movie).toBe('yaca_search_standard-movie.json');
        expect(series).toBe('yaca_search_standard-series.json');
        expect(new Set([movie, series]).size).toBe(2);
    });

    it('keeps both typed catalogs in review and compare artifacts', () => {
        const runA = writeFixtureRun(tempRoot, 'run-a');
        const runB = writeFixtureRun(tempRoot, 'run-b');

        const reviewA = runReview({ run: runA });
        const reviewB = runReview({ run: runB });
        expect(reviewA.totals.catalogs).toBe(2);
        expect(reviewB.totals.catalogs).toBe(2);
        expect(reviewB.profiles.sim_prof_harness.catalogIndex.map(c => c.type).sort()).toEqual(['movie', 'series']);

        const { report } = runCompare(runA, runB);
        expect(report.totals.a.catalogs).toBe(2);
        expect(report.totals.b.catalogs).toBe(2);
        expect(report.catalogsOnlyInA).toEqual([]);
        expect(report.catalogsOnlyInB).toEqual([]);
        expect(report.catalogs).toHaveLength(2);
    });
});
