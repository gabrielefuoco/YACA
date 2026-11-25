const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { AnimeUnityClient } = require('../src/animeunity');
const { SeriesDiscoveryManager, LAST_HOME_RUN_FILE } = require('../src/discovery');
const { runHomePass } = require('../cli');

function makeHomeHtml(items) {
    const json = JSON.stringify(items).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return `<div id="app"><layout-items items-json="${json}"></layout-items></div>`;
}

function sampleHomeItem(id = 7701) {
    return {
        id: 100 + id,
        anime_id: id,
        number: '6',
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        anime: {
            id,
            dub: 0,
            title: `Anime Test ${id}`,
            anilist_id: 171018,
            mal_id: 57334,
            status: 'In Corso'
        }
    };
}

async function startServer(handler) {
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    return {
        port,
        close: () => new Promise((resolve) => server.close(resolve))
    };
}

describe('AnimeUnity HTTP redirect & zero-item guard (t14)', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-t14-'));
    });

    afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('301 con location sullo stesso host viene seguito e il body finale viene parsato', async () => {
        const seenHeaders = [];
        const srv = await startServer((req, res) => {
            seenHeaders.push({ url: req.url, ua: req.headers['user-agent'] });
            if (req.url === '/') {
                res.writeHead(301, { Location: '/hop-308' });
                res.end('<html>301</html>');
                return;
            }
            if (req.url === '/hop-308') {
                res.writeHead(308, { Location: '/nuova-home' });
                res.end('<html>308</html>');
                return;
            }
            if (req.url === '/nuova-home') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(makeHomeHtml([sampleHomeItem(8801)]));
                return;
            }
            res.writeHead(404);
            res.end();
        });

        const warns = [];
        const origWarn = console.warn;
        console.warn = (...args) => warns.push(args.join(' '));
        try {
            const client = new AnimeUnityClient({
                baseUrl: `http://127.0.0.1:${srv.port}`,
                userAgent: 'YACA-Test-UA/1.0',
                requestDelayMs: 0
            });
            const items = await client.getLatestReleasesFromHome();
            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].anime.id, 8801);
            assert.strictEqual(seenHeaders.length, 3);
            assert.ok(seenHeaders.every((h) => h.ua === 'YACA-Test-UA/1.0'));
            assert.strictEqual(warns.length, 0, 'nessun warning su redirect nello stesso host');
        } finally {
            console.warn = origWarn;
            await srv.close();
        }
    });

    test('301 verso un host diverso viene seguito ed emette un warning una sola volta', async () => {
        const targetSrv = await startServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(makeHomeHtml([sampleHomeItem(8802)]));
        });
        const oldSrv = await startServer((req, res) => {
            res.writeHead(301, { Location: `http://localhost:${targetSrv.port}${req.url}` });
            res.end('<html>Moved</html>');
        });

        const warns = [];
        const origWarn = console.warn;
        console.warn = (...args) => warns.push(args.join(' '));
        try {
            const client = new AnimeUnityClient({
                baseUrl: `http://127.0.0.1:${oldSrv.port}`,
                requestDelayMs: 0
            });

            const first = await client.getLatestReleasesFromHome();
            const second = await client.getLatestReleasesFromHome();

            assert.strictEqual(first.length, 1);
            assert.strictEqual(first[0].anime.id, 8802);
            assert.strictEqual(second.length, 1);
            assert.strictEqual(warns.length, 1, 'il warning cross-host deve essere emesso una sola volta');
            assert.ok(warns[0].includes(`localhost:${targetSrv.port}`), 'il warning nomina il nuovo host');
            assert.ok(warns[0].includes('ANIMEUNITY_BASE_URL'));
        } finally {
            console.warn = origWarn;
            await oldSrv.close();
            await targetSrv.close();
        }
    });

    test('più di 3 hop si fermano e segnalano errore senza andare in loop (3 hop ok)', async () => {
        let requests = 0;
        const srv = await startServer((req, res) => {
            requests++;
            const step = req.url === '/' ? 0 : Number(req.url.replace('/hop', ''));
            if (req.url.startsWith('/ok-after-3')) {
                const n = req.url === '/ok-after-3' ? 0 : Number(req.url.replace('/ok-after-3-', ''));
                if (n < 3) {
                    res.writeHead(302, { Location: `/ok-after-3-${n + 1}` });
                    res.end();
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(makeHomeHtml([sampleHomeItem(8803)]));
                return;
            }
            res.writeHead(301, { Location: `/hop${step + 1}` });
            res.end('loop');
        });

        const errors = [];
        const origError = console.error;
        console.error = (...args) => errors.push(args.join(' '));
        try {
            // 4+ hop -> si ferma a 3 hop (4 richieste totali) e logga errore
            const client = new AnimeUnityClient({
                baseUrl: `http://127.0.0.1:${srv.port}`,
                requestDelayMs: 0
            });
            const items = await client.getLatestReleasesFromHome();
            assert.deepStrictEqual(items, []);
            assert.strictEqual(requests, 4, 'richiesta iniziale + 3 hop max, non oltre');
            assert.ok(errors.some((e) => e.includes('Troppi redirect')));

            // Esattamente 3 hop -> riesce
            const okClient = new AnimeUnityClient({
                baseUrl: `http://127.0.0.1:${srv.port}/ok-after-3`,
                requestDelayMs: 0
            });
            const okItems = await okClient.getLatestReleasesFromHome();
            assert.strictEqual(okItems.length, 1);
            assert.strictEqual(okItems[0].anime.id, 8803);
        } finally {
            console.error = origError;
            await srv.close();
        }
    });

    test('200 con 0 item estratti logga status/lunghezza, salva zeroItems: true e --health-check esce 1', async () => {
        const deadBody = '<html>\r\n<head><title>301 Moved Permanently</title></head>\r\n<body>\r\n<center><h1>301 Moved Permanently</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>\r\n';
        const srv = await startServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(deadBody);
        });

        const errors = [];
        const origError = console.error;
        console.error = (...args) => errors.push(args.join(' '));
        try {
            const client = new AnimeUnityClient({
                baseUrl: `http://127.0.0.1:${srv.port}`,
                requestDelayMs: 0
            });
            const discovery = new SeriesDiscoveryManager({ cacheDir: tmpDir });
            discovery.writeHeartbeat(new Date()); // last-run.json fresco (< 12h)

            const res = await runHomePass({
                full: false,
                announce: false,
                animeClient: client,
                discoveryManager: discovery,
                identityResolver: { enrichWithFallbacks: async () => {}, resolve: () => null },
                dryRun: true
            });

            assert.strictEqual(res.read, 0);
            assert.ok(errors.some((e) => e.includes('200') && e.includes(String(deadBody.length))));

            const lastHome = JSON.parse(fs.readFileSync(path.join(tmpDir, LAST_HOME_RUN_FILE), 'utf8'));
            assert.strictEqual(lastHome.items, 0);
            assert.strictEqual(lastHome.zeroItems, true);

            const health = discovery.checkHealth();
            assert.strictEqual(health.ok, false);

            // Verifica end-to-end del ramo --health-check di cli.js con exit code 1
            const script = [
                'const dir = process.argv[1];',
                'const Module = require("module");',
                'const origLoad = Module._load;',
                'Module._load = function(req) {',
                '  const exp = origLoad.apply(this, arguments);',
                '  if (req === "./src/discovery") {',
                '    const Orig = exp.SeriesDiscoveryManager;',
                '    return { ...exp, SeriesDiscoveryManager: class extends Orig { constructor(o = {}) { super({ ...o, cacheDir: dir }); } } };',
                '  }',
                '  return exp;',
                '};',
                'process.argv = ["node", "cli.js", "--health-check"];',
                'require("./cli").main();'
            ].join(' ');
            const proc = spawnSync(process.execPath, ['-e', script, tmpDir], {
                cwd: path.join(__dirname, '..'),
                encoding: 'utf8'
            });
            assert.strictEqual(proc.status, 1, 'cli.js --health-check deve uscire con codice 1');

            // Retrocompatibilità: file legacy senza campo zeroItems non fa fallire checkHealth
            fs.writeFileSync(path.join(tmpDir, LAST_HOME_RUN_FILE), JSON.stringify({ timestamp: new Date().toISOString() }));
            assert.strictEqual(discovery.checkHealth().ok, true);

            // Quando writeHomeHeartbeat registra items > 0 -> zeroItems: false e --health-check esce 0
            const okPayload = discovery.writeHomeHeartbeat(new Date(), { items: 3 });
            assert.strictEqual(okPayload.items, 3);
            assert.strictEqual(okPayload.zeroItems, false);
            assert.strictEqual(discovery.checkHealth().ok, true);
            const procOk = spawnSync(process.execPath, ['-e', script, tmpDir], {
                cwd: path.join(__dirname, '..'),
                encoding: 'utf8'
            });
            assert.strictEqual(procOk.status, 0, 'cli.js --health-check deve uscire con codice 0 dopo una home run valida');
        } finally {
            console.error = origError;
            await srv.close();
        }
    });
});
