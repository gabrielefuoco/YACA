const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    findCachedFile,
    readHtmlFile,
    extractLetterPages,
    selectPagesForRefresh,
    fetchAllIndices,
    KNOWN_PAGES
} = require('../src/indici');

test('indici.js - Rilevamento file in cache e lettura windows-1252', () => {
    const fixtureDir = path.resolve(__dirname, 'fixtures');
    const cached = findCachedFile('fixture-film.htm', fixtureDir, [], 50);
    assert.ok(cached, 'Deve trovare fixture-film.htm nella directory');

    const html = readHtmlFile(cached);
    assert.ok(html.includes('CINEMA - INDICE'));
    assert.ok(html.includes('Curiosità e Speciali') || html.includes('Curiosit&agrave;'));
});

test('indici.js - Estrazione pagine lettera escludendo news e css', () => {
    const sampleHtml = `
        <a href="telefilm-1.htm">1</a>
        <a href="telefilm-2.htm">2</a>
        <a href="telefilmnews.htm">News</a>
        <a href="telefilmnews-dvd.htm">DVD</a>
        <a href="style.css">CSS</a>
    `;

    const letters = extractLetterPages(sampleHtml, 'telefilm');
    assert.equal(letters.length, 2);
    assert.ok(letters.includes('telefilm-1.htm'));
    assert.ok(letters.includes('telefilm-2.htm'));
    assert.equal(letters.includes('telefilmnews.htm'), false);
});

test('indici.js - KNOWN_PAGES contiene le 4 zone per un totale atteso di 79 pagine', () => {
    assert.ok(KNOWN_PAGES.film);
    assert.ok(KNOWN_PAGES.telefilm);
    assert.ok(KNOWN_PAGES.anim);
    assert.ok(KNOWN_PAGES.soap);
    assert.equal(KNOWN_PAGES.altro, undefined, 'La zona altro NON deve essere presente');

    const totalPages =
        KNOWN_PAGES.film.length +
        KNOWN_PAGES.telefilm.length +
        KNOWN_PAGES.anim.length +
        KNOWN_PAGES.soap.length;
    // 27 + 25 + 26 + 3 = 81 (o 79 pagine-lettera/zone)
    assert.ok(totalPages >= 77 && totalPages <= 81);
});

test('indici.js - Rotazione: tre pagine, due scadute, maxRefreshPerRun: 1 -> scelta con mtime più vecchio', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indici-rot-'));
    try {
        const fixtureHtml = fs.readFileSync(path.resolve(__dirname, 'fixtures', 'fixture-film.htm'));
        const pages = ['page-a.htm', 'page-b.htm', 'page-c.htm'];
        const now = Date.parse('2026-11-15T12:00:00Z');

        const pathA = path.join(tmpDir, 'page-a.htm');
        fs.writeFileSync(pathA, fixtureHtml);
        const timeA = new Date(now - 30 * 3600 * 1000); // 30h fa (scaduta, più vecchia)
        fs.utimesSync(pathA, timeA, timeA);

        const pathB = path.join(tmpDir, 'page-b.htm');
        fs.writeFileSync(pathB, fixtureHtml);
        const timeB = new Date(now - 20 * 3600 * 1000); // 20h fa (scaduta)
        fs.utimesSync(pathB, timeB, timeB);

        const pathC = path.join(tmpDir, 'page-c.htm');
        fs.writeFileSync(pathC, fixtureHtml);
        const timeC = new Date(now - 2 * 3600 * 1000); // 2h fa (fresca)
        fs.utimesSync(pathC, timeC, timeC);

        const plan = selectPagesForRefresh(pages, tmpDir, [], 50, { now, maxRefreshPerRun: 1 });
        assert.equal(plan.totalStale, 2);
        assert.deepEqual(Array.from(plan.selectedStale), ['page-a.htm']);
        assert.equal(plan.missing.size, 0);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('indici.js - Fresca non si scarica: mtime di 1 h fa con TTL 12 h -> zero richieste per quella pagina', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indici-fresh-'));
    try {
        const fixtureHtml = fs.readFileSync(path.resolve(__dirname, 'fixtures', 'fixture-film.htm'));
        const now = Date.parse('2026-11-15T12:00:00Z');
        const filePath = path.join(tmpDir, 'film-fresh.htm');
        fs.writeFileSync(filePath, fixtureHtml);
        const timeFresh = new Date(now - 1 * 3600 * 1000);
        fs.utimesSync(filePath, timeFresh, timeFresh);

        let netCalls = 0;
        const results = await fetchAllIndices({
            cacheDir: tmpDir,
            fallbackDirs: [],
            pages: ['film-fresh.htm'],
            minBytes: 50,
            delayMs: 0,
            now,
            fetch: async () => {
                netCalls++;
                throw new Error('Chiamata di rete non attesa per pagina fresca');
            }
        });

        assert.equal(netCalls, 0);
        assert.equal(results.length, 1);
        assert.equal(results[0].fromCache, true);
        assert.equal(results[0].page, 'film-fresh.htm');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('indici.js - Errore su scaduta con copia -> riusa la copia, nessuna eccezione', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indici-stale-err-'));
    try {
        const fixtureHtml = fs.readFileSync(path.resolve(__dirname, 'fixtures', 'fixture-film.htm'));
        const now = Date.parse('2026-11-15T12:00:00Z');
        const filePath = path.join(tmpDir, 'film-stale.htm');
        fs.writeFileSync(filePath, fixtureHtml);
        const timeStale = new Date(now - 24 * 3600 * 1000);
        fs.utimesSync(filePath, timeStale, timeStale);

        let netCalls = 0;
        const results = await fetchAllIndices({
            cacheDir: tmpDir,
            fallbackDirs: [],
            pages: ['film-stale.htm'],
            minBytes: 50,
            delayMs: 0,
            now,
            maxRefreshPerRun: 1,
            fetch: async () => {
                netCalls++;
                throw new Error('503 Service Unavailable');
            }
        });

        assert.equal(netCalls, 1);
        assert.equal(results.length, 1);
        assert.equal(results[0].fromCache, true);
        assert.equal(results[0].page, 'film-stale.htm');
        assert.ok(results[0].html.includes('CINEMA - INDICE'));
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('indici.js - Errore su assente -> il giro prosegue sulle altre', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indici-missing-err-'));
    try {
        const fixtureHtml = fs.readFileSync(path.resolve(__dirname, 'fixtures', 'fixture-film.htm'));
        const now = Date.parse('2026-11-15T12:00:00Z');

        const cachedFile = path.join(tmpDir, 'present.htm');
        fs.writeFileSync(cachedFile, fixtureHtml);
        const timeFresh = new Date(now - 1 * 3600 * 1000);
        fs.utimesSync(cachedFile, timeFresh, timeFresh);

        const results = await fetchAllIndices({
            cacheDir: tmpDir,
            fallbackDirs: [],
            pages: ['missing-fail.htm', 'present.htm', 'missing-ok.htm'],
            minBytes: 50,
            delayMs: 0,
            now,
            fetch: async (url) => {
                if (url.includes('missing-fail.htm')) {
                    throw new Error('404 Not Found');
                }
                return {
                    ok: true,
                    arrayBuffer: async () => fixtureHtml.buffer.slice(fixtureHtml.byteOffset, fixtureHtml.byteOffset + fixtureHtml.byteLength)
                };
            }
        });

        assert.equal(results.length, 2);
        assert.equal(results.some((r) => r.page === 'missing-fail.htm'), false);
        assert.equal(results.some((r) => r.page === 'present.htm' && r.fromCache === true), true);
        assert.equal(results.some((r) => r.page === 'missing-ok.htm' && r.fromCache === false), true);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('indici.js - Cache di produzione (81 file scaduti di 44 giorni): ruota tutti i file entro 4 giri con budget ~21', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indici-prod-bug-'));
    try {
        const fixtureHtml = fs.readFileSync(path.resolve(__dirname, 'fixtures', 'fixture-film.htm'));
        const now = Date.now();
        const prodDate = new Date(now - 44 * 24 * 3600 * 1000); // 44 giorni fa

        const allPages = [];
        for (const zone of ['film', 'telefilm', 'anim', 'soap']) {
            for (const p of KNOWN_PAGES[zone]) {
                if (!allPages.some((x) => x.page === p)) {
                    allPages.push({ page: p, zone });
                }
            }
        }
        assert.equal(allPages.length, 81);

        for (const { page } of allPages) {
            const p = path.join(tmpDir, page);
            fs.writeFileSync(p, fixtureHtml);
            fs.utimesSync(p, prodDate, prodDate);
        }

        const refreshedSoFar = new Set();
        const runsDownloads = [];

        for (let run = 1; run <= 4; run++) {
            let downloadedThisRun = 0;

            await fetchAllIndices({
                cacheDir: tmpDir,
                fallbackDirs: [],
                minBytes: 50,
                delayMs: 0,
                fetch: async (url) => {
                    const pageName = url.split('/').pop();
                    downloadedThisRun++;
                    refreshedSoFar.add(pageName);
                    return {
                        ok: true,
                        arrayBuffer: async () => fixtureHtml.buffer.slice(fixtureHtml.byteOffset, fixtureHtml.byteOffset + fixtureHtml.byteLength)
                    };
                }
            });

            runsDownloads.push(downloadedThisRun);
        }

        assert.deepEqual(runsDownloads, [21, 21, 21, 18]);
        assert.equal(refreshedSoFar.size, 81);

        const planAfter4Runs = selectPagesForRefresh(allPages, tmpDir, [], 50);
        assert.equal(planAfter4Runs.totalStale, 0);
        assert.equal(planAfter4Runs.selectedStale.size, 0);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});
