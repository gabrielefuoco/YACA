/**
 * Test per cli.js (arg parsing e opzioni resolve-ids).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { parseArgs } = require('../cli');

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
