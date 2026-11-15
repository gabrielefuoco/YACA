const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const {
    VOTE_FLOOR,
    ITALIAN_VOTE_FLOOR,
    shouldKeepTmdbRecord,
    loadItaDubbedIds
} = require('../tmdbIngestPolicy');
const TmdbDumpClient = require('../tmdbDumpClient');

test('shouldKeepTmdbRecord: (a) vote_count=5 + originalLanguage:"it" -> kept', async () => {
    const kept = await shouldKeepTmdbRecord(101, 5, {
        originalLanguage: 'it',
        itaDubbedIds: new Set(),
        trackedIds: new Set()
    });
    assert.equal(kept, true);
});

test('shouldKeepTmdbRecord: (b) vote_count=5 + id in dubbed set -> kept', async () => {
    const kept = await shouldKeepTmdbRecord(202, 5, {
        originalLanguage: 'en',
        itaDubbedIds: new Set([202]),
        trackedIds: new Set()
    });
    assert.equal(kept, true);

    // Anche con id passato come stringa
    const keptStr = await shouldKeepTmdbRecord('202', 5, {
        originalLanguage: 'en',
        itaDubbedIds: new Set([202]),
        trackedIds: new Set()
    });
    assert.equal(keptStr, true);
});

test('shouldKeepTmdbRecord: (c) vote_count=5 + neither -> dropped', async () => {
    const kept = await shouldKeepTmdbRecord(303, 5, {
        originalLanguage: 'en',
        itaDubbedIds: new Set([999]),
        trackedIds: new Set()
    });
    assert.equal(kept, false);
});

test('shouldKeepTmdbRecord: (d) vote_count=10 -> always kept', async () => {
    const kept = await shouldKeepTmdbRecord(404, 10, {
        originalLanguage: 'ja',
        itaDubbedIds: new Set(),
        trackedIds: new Set()
    });
    assert.equal(kept, true);

    // Con vote_count maggiore del floor
    const keptHigher = await shouldKeepTmdbRecord(405, 50, {
        originalLanguage: 'fr'
    });
    assert.equal(keptHigher, true);
});

test('export filter: (e) TV keeps popularity 0.7, movies drop it, dubbed below both thresholds kept', async () => {
    const fixtureLines = [
        JSON.stringify({ id: 10, popularity: 0.7, adult: false }), // TV kept (>=0.6), Movie dropped (<1.0)
        JSON.stringify({ id: 20, popularity: 0.3, adult: false }), // Dubbed item below both thresholds -> kept for both
        JSON.stringify({ id: 30, popularity: 1.5, adult: false }), // Kept for both (>=1.0)
        JSON.stringify({ id: 40, popularity: 2.0, adult: true })   // Adult -> dropped for both
    ];

    const dubbedSet = new Set([20]);

    // Test TV filter
    const tvStream = Readable.from(fixtureLines.join('\n'));
    const tvResult = await TmdbDumpClient.filterDailyExportStream(tvStream, 'tv', { itaDubbedIds: dubbedSet });
    assert.deepEqual(tvResult.validIds, [10, 20, 30]);
    assert.equal(tvResult.counters.new_threshold, 1, 'id 10 è nella fascia 0.6 <= pop < 1.0');
    assert.equal(tvResult.counters.dubbed_inclusion, 1, 'id 20 è entrato tramite dubbed_inclusion');
    assert.equal(tvResult.counters.threshold, 2, 'id 10 e 30 sono passati per soglia popolarità');

    // Test Movie filter
    const movieStream = Readable.from(fixtureLines.join('\n'));
    const movieResult = await TmdbDumpClient.filterDailyExportStream(movieStream, 'movies', { itaDubbedIds: dubbedSet });
    assert.deepEqual(movieResult.validIds, [20, 30], 'Movies scarta pop 0.7 (id 10) e include dubbed (id 20) + pop 1.5 (id 30)');
    assert.equal(movieResult.counters.new_threshold, 0, 'Movies non ha la soglia 0.6');
    assert.equal(movieResult.counters.dubbed_inclusion, 1, 'id 20 è entrato tramite dubbed_inclusion');
    assert.equal(movieResult.counters.threshold, 1, 'solo id 30 è passato per soglia movie 1.0');
});

test('loadItaDubbedIds: (f) ignores null rows and other media type, survives missing file', async () => {
    // 1. File assente -> Set vuoto senza eccezioni
    const missingSet = await loadItaDubbedIds('tv', { filePath: path.join(os.tmpdir(), 'non-existent-ita-file.jsonl') });
    assert.ok(missingSet instanceof Set);
    assert.equal(missingSet.size, 0);

    // 2. Fixture con righe null, altro tipo, ita non true, e righe malformate
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ita-test-'));
    const fixturePath = path.join(tmpDir, 'ita_annotations_fixture.jsonl');
    try {
        const lines = [
            'null',
            '',
            '   ',
            '{ invalid json }',
            JSON.stringify({ t: 'tv', id: null, ita: true }),
            JSON.stringify({ t: 'tv', id: 501, ita: true }),
            JSON.stringify({ t: 'tv', id: 502, ita: null }),
            JSON.stringify({ t: 'tv', id: 503, ita: false }),
            JSON.stringify({ t: 'movie', id: 601, ita: true }),
            JSON.stringify({ t: 'movie', id: 602, ita: null }),
            JSON.stringify({ t: 'tv', id: 504, ita: true })
        ];
        fs.writeFileSync(fixturePath, lines.join('\n'), 'utf8');

        // TV: deve estrarre solo 501 e 504
        const tvIds = await loadItaDubbedIds('tv', { filePath: fixturePath });
        assert.deepEqual(Array.from(tvIds).sort(), [501, 504]);

        // Movie: deve estrarre solo 601
        const movieIds = await loadItaDubbedIds('movies', { filePath: fixturePath });
        assert.deepEqual(Array.from(movieIds), [601]);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});
