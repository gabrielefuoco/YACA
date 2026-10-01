/**
 * cli.test.js
 * Test offline del CLI e del parsing argomenti.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../cli');

test('cli parseArgs - default', () => {
    const opts = parseArgs([]);
    assert.equal(opts.dryRun, false);
    assert.equal(opts.healthCheck, false);
    assert.equal(opts.forceRefresh, false);
    assert.equal(opts.disableAnime, false);
    assert.equal(opts.limitCatalog, null);
});

test('cli parseArgs - opzioni anime (--mongo-uri, --no-anime, --disable-anime)', () => {
    const opts1 = parseArgs(['--mongo-uri', 'mongodb://custom:27017/test', '--no-anime']);
    assert.equal(opts1.mongoUri, 'mongodb://custom:27017/test');
    assert.equal(opts1.disableAnime, true);

    const opts2 = parseArgs(['--disable-anime']);
    assert.equal(opts2.disableAnime, true);
});

test('cli parseArgs - altre opzioni di catalogo e dry-run', () => {
    const opts = parseArgs([
        '--dry-run',
        '--limit-catalog', '50',
        '--movies-path', '/tmp/movies.jsonl',
        '--tv-path', '/tmp/tv.jsonl',
        '--output', '/tmp/out.jsonl'
    ]);
    assert.equal(opts.dryRun, true);
    assert.equal(opts.limitCatalog, 50);
    assert.ok(opts.moviesPath.includes('movies.jsonl'));
    assert.ok(opts.tvPath.includes('tv.jsonl'));
    assert.ok(opts.outputPath.includes('out.jsonl'));
});
