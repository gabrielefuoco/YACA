/**
 * cli.test.js
 * Test offline del CLI e del parsing argomenti.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
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

// Dal ramo della risoluzione per TMDB id: le opzioni del sottocomando.
test('cli - parseArgs riconosce le opzioni di default', () => {
    const opts = parseArgs([]);
    assert.equal(opts.dryRun, false);
    assert.equal(opts.healthCheck, false);
    assert.equal(opts.resolveIds, false);
    assert.equal(opts.limit, null);
    assert.equal(opts.maxCalls, Infinity);
    assert.equal(opts.delay, 120);
});

test('cli - parseArgs riconosce le opzioni di risoluzione id', () => {
    const opts = parseArgs([
        '--resolve-ids',
        '--limit', '30',
        '--max-calls', '60',
        '--delay', '50',
        '--tmdb-cache-dir', './test-cache',
        '--dry-run'
    ]);

    assert.equal(opts.resolveIds, true);
    assert.equal(opts.limit, 30);
    assert.equal(opts.maxCalls, 60);
    assert.equal(opts.delay, 50);
    assert.equal(opts.tmdbCacheDir, path.resolve('./test-cache'));
    assert.equal(opts.dryRun, true);
});
