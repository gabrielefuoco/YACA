const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { IdentityResolver } = require('../src/identity');

describe('Identity Resolver', () => {
    test('risolve correttamente Dandadan da fixture reali Fribb e Anibridge', () => {
        const fribbFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/fribb_dandadan.json'), 'utf8'));
        const anibridgeFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/anibridge_dandadan.json'), 'utf8'));

        const resolver = new IdentityResolver();
        resolver.loadFromData({ fribbData: fribbFixture, anibridgeData: anibridgeFixture });

        // Risoluzione tramite AniList ID 171018
        const resFromAnilist = resolver.resolve({ anilistId: 171018 });
        assert.ok(resFromAnilist, 'Deve risolvere da anilist_id');
        assert.strictEqual(resFromAnilist.tmdbId, '240411');
        assert.strictEqual(resFromAnilist.kitsuId, '48269');
        assert.strictEqual(resFromAnilist.anilistId, 171018);
        assert.strictEqual(resFromAnilist.season, 1);

        // Risoluzione tramite MAL ID 57334
        const resFromMal = resolver.resolve({ malId: 57334 });
        assert.ok(resFromMal, 'Deve risolvere da mal_id');
        assert.strictEqual(resFromMal.tmdbId, '240411');
        assert.strictEqual(resFromMal.kitsuId, '48269');
        assert.strictEqual(resFromMal.malId, 57334);
        assert.strictEqual(resFromMal.season, 1);

        // Risoluzione con entrambi forniti (come fa AnimeUnity)
        const resBoth = resolver.resolve({ anilistId: 171018, malId: 57334 });
        assert.ok(resBoth);
        assert.strictEqual(resBoth.tmdbId, '240411');
        assert.strictEqual(resBoth.kitsuId, '48269');
    });

    test('ritorna null per ID sconosciuti (nessun fuzzy matching sui titoli, nessun dato inventato)', () => {
        const resolver = new IdentityResolver();
        resolver.loadFromData({ fribbData: [], anibridgeData: {} });

        const res = resolver.resolve({ anilistId: 99999999, malId: 88888888 });
        assert.strictEqual(res, null);

        const resEmpty = resolver.resolve({});
        assert.strictEqual(resEmpty, null);
    });

    describe('Cache TTL e Refresh (Deliverable A)', () => {
        const os = require('os');
        const fribbFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/fribb_dandadan.json'), 'utf8'));
        const anibridgeFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/anibridge_dandadan.json'), 'utf8'));

        function createTestDir() {
            return fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-identity-test-'));
        }

        test('mtime fresco → non riscarica dalla rete', async () => {
            const testDir = createTestDir();
            try {
                // Prepara file freschi su disco
                fs.writeFileSync(path.join(testDir, 'fribb-mini.json'), JSON.stringify(fribbFixture));
                fs.writeFileSync(path.join(testDir, 'anibridge-mappings.json'), JSON.stringify(anibridgeFixture));

                let fetchCalled = 0;
                const mockFetch = async () => {
                    fetchCalled++;
                    throw new Error('fetch non dovrebbe essere chiamato');
                };

                const resolver = new IdentityResolver({
                    cacheDir: testDir,
                    fetch: mockFetch,
                    maxAgeMs: 3 * 60 * 60 * 1000 // 3 ore
                });

                await resolver.init();

                assert.strictEqual(fetchCalled, 0, 'La rete non deve essere contattata per file freschi');
                assert.strictEqual(resolver.isReady, true);
                const res = resolver.resolve({ anilistId: 171018 });
                assert.strictEqual(res.tmdbId, '240411');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('mtime vecchio → tenta download e aggiorna i dump', async () => {
            const testDir = createTestDir();
            try {
                const fribbPath = path.join(testDir, 'fribb-mini.json');
                const anibridgePath = path.join(testDir, 'anibridge-mappings.json');

                fs.writeFileSync(fribbPath, JSON.stringify([]));
                fs.writeFileSync(anibridgePath, JSON.stringify({}));

                // Imposta mtime a 5 ore fa (> 3h TTL)
                const pastDate = new Date(Date.now() - 5 * 60 * 60 * 1000);
                fs.utimesSync(fribbPath, pastDate, pastDate);
                fs.utimesSync(anibridgePath, pastDate, pastDate);

                let fetchUrls = [];
                const mockFetch = async (url) => {
                    fetchUrls.push(url);
                    if (url.includes('Fribb')) {
                        return { ok: true, json: async () => fribbFixture };
                    }
                    return { ok: true, json: async () => anibridgeFixture };
                };

                const resolver = new IdentityResolver({
                    cacheDir: testDir,
                    fetch: mockFetch,
                    maxAgeMs: 3 * 60 * 60 * 1000
                });

                await resolver.init();

                assert.strictEqual(fetchUrls.length, 2, 'Devono essere riscaricati entrambi i dump');
                assert.strictEqual(resolver.isReady, true);
                const res = resolver.resolve({ anilistId: 171018 });
                assert.strictEqual(res.tmdbId, '240411');

                // Verifica che mtime sia stato aggiornato a un timestamp fresco
                const statAfter = fs.statSync(fribbPath);
                assert.ok(Date.now() - statAfter.mtimeMs < 10000, 'mtime deve essere aggiornato a ora');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('download fallito con cache precedente → usa la cache (nessun crash, solo warning)', async () => {
            const testDir = createTestDir();
            try {
                const fribbPath = path.join(testDir, 'fribb-mini.json');
                const anibridgePath = path.join(testDir, 'anibridge-mappings.json');

                // Salva cache valida ma vecchia
                fs.writeFileSync(fribbPath, JSON.stringify(fribbFixture));
                fs.writeFileSync(anibridgePath, JSON.stringify(anibridgeFixture));

                const pastDate = new Date(Date.now() - 5 * 60 * 60 * 1000);
                fs.utimesSync(fribbPath, pastDate, pastDate);
                fs.utimesSync(anibridgePath, pastDate, pastDate);

                let fetchAttempts = 0;
                const mockFetch = async () => {
                    fetchAttempts++;
                    throw new Error('503 Service Unavailable');
                };

                const resolver = new IdentityResolver({
                    cacheDir: testDir,
                    fetch: mockFetch,
                    maxAgeMs: 3 * 60 * 60 * 1000
                });

                // Non deve lanciare eccezioni!
                await resolver.init();

                assert.strictEqual(fetchAttempts, 2, 'Ha tentato il download');
                assert.strictEqual(resolver.isReady, true);
                // I dati della cache precedente sono stati mantenuti
                const res = resolver.resolve({ anilistId: 171018 });
                assert.strictEqual(res.tmdbId, '240411');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('download fallito senza cache precedente → lancia errore', async () => {
            const testDir = createTestDir();
            try {
                const mockFetch = async () => {
                    throw new Error('404 Not Found');
                };

                const resolver = new IdentityResolver({
                    cacheDir: testDir,
                    fetch: mockFetch
                });

                await assert.rejects(resolver.init(), /Download Fribb fallito/);
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });
    });
});

