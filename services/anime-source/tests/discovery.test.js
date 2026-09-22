const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { extractArchiveRecords, AnimeUnityClient } = require('../src/animeunity');
const { SeriesDiscoveryManager, MAX_HEALTH_AGE_MS, MAX_LIST_AGE_MS } = require('../src/discovery');
const { groupRecordsByTmdb, parseArgs } = require('../cli');
const { IdentityResolver } = require('../src/identity');

describe('Discovery & Observability (Ticket 18, 19, 20)', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-anime-test-'));
    });

    afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('extractArchiveRecords parsa correttamente sia stringa JSON che oggetto dalla fixture archive_in_corso.json', () => {
        const fixturePath = path.join(__dirname, 'fixtures/archive_in_corso.json');
        const rawJson = fs.readFileSync(fixturePath, 'utf8');
        const parsedObj = JSON.parse(rawJson);

        // 1. Test da stringa JSON
        const recordsFromString = extractArchiveRecords(rawJson);
        assert.ok(Array.isArray(recordsFromString), 'Deve essere un array');
        assert.strictEqual(recordsFromString.length, 30, 'Fixture contiene 30 record');

        // 2. Test da oggetto JS già parsato
        const recordsFromObj = extractArchiveRecords(parsedObj);
        assert.strictEqual(recordsFromObj.length, 30);
        assert.strictEqual(recordsFromObj[0].id, 7726);
        assert.strictEqual(recordsFromObj[0].status, 'In Corso');

        // 3. Verifica campi necessari per la discovery
        const first = recordsFromObj[0];
        assert.ok(first.id, 'id presente');
        assert.ok(first.title, 'title presente');
        assert.strictEqual(typeof first.dub, 'number', 'dub presente come numero');
        assert.ok(first.anilist_id, 'anilist_id presente');
        assert.ok(first.mal_id, 'mal_id presente');
    });

    test('groupRecordsByTmdb raggruppa e normalizza le serie scoperte gestendo titoli alternativi e slug', async () => {
        const fixturePath = path.join(__dirname, 'fixtures/archive_in_corso.json');
        const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

        // Mock IdentityResolver con caricamento offline
        const resolver = new IdentityResolver({ cacheDir: tmpDir });
        const fribbFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/fribb_dandadan.json'), 'utf8'));
        const anibridgeFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/anibridge_dandadan.json'), 'utf8'));

        // Aggiungi un mapping di test per un anime della fixture (es. anilist: 171110 -> Honzuki)
        fribbFixture.push({
            anilist_id: 171110,
            mal_id: 57466,
            themoviedb_id: 91768
        });
        // Aggiungi un mapping per Beyblade X (ha title null, solo title_eng)
        fribbFixture.push({
            anilist_id: 165159,
            mal_id: 56566,
            themoviedb_id: 226688
        });

        resolver.loadFromData({ fribbData: fribbFixture, anibridgeData: anibridgeFixture });

        const groups = groupRecordsByTmdb(fixtureData.records, resolver);
        assert.ok(groups.length >= 2, 'Almeno 2 gruppi risolti');

        const honzuki = groups.find(g => g.tmdbId === '91768');
        assert.ok(honzuki, 'Gruppo Honzuki presente');
        assert.ok(honzuki.title.includes('Honzuki'));

        const beyblade = groups.find(g => g.tmdbId === '226688');
        assert.ok(beyblade, 'Gruppo Beyblade presente');
        assert.strictEqual(beyblade.title, 'Beyblade X', 'Titolo ripulito da title_eng quando title è null');
    });

    test('AnimeUnityClient.getOngoingSeries rispetta il budget di limite e gestisce la paginazione', async () => {
        const mockRecordsP1 = Array.from({ length: 30 }, (_, i) => ({
            id: 1000 + i,
            title: `Anime Ep ${i + 1}`,
            status: 'In Corso',
            dub: 0,
            anilist_id: 2000 + i,
            mal_id: 3000 + i
        }));

        const mockRecordsP2 = Array.from({ length: 20 }, (_, i) => ({
            id: 2000 + i,
            title: `Anime P2 Ep ${i + 1}`,
            status: 'In Corso',
            dub: 0,
            anilist_id: 4000 + i,
            mal_id: 5000 + i
        }));

        const mockFetch = async (url, options = {}) => {
            if (url.includes('/archivio') && (!options.method || options.method === 'GET')) {
                return {
                    ok: true,
                    status: 200,
                    headers: {
                        getSetCookie: () => ['XSRF-TOKEN=mock-token; Path=/', 'animeunity_session=mock-session; Path=/'],
                        get: () => 'XSRF-TOKEN=mock-token;'
                    },
                    text: async () => '<html><head><meta name="csrf-token" content="mock-csrf-123"></head><body></body></html>'
                };
            }

            if (url.includes('/archivio/get-animes') && options.method === 'POST') {
                const body = JSON.parse(options.body);
                assert.strictEqual(body.status, 'In corso');
                assert.strictEqual(options.headers['X-CSRF-TOKEN'], 'mock-csrf-123');

                if (body.offset === 0) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ tot: 50, records: mockRecordsP1 })
                    };
                } else if (body.offset === 30) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ tot: 50, records: mockRecordsP2 })
                    };
                }
            }

            return { ok: false, status: 404 };
        };

        const client = new AnimeUnityClient({ fetch: mockFetch, requestDelayMs: 0 });

        // Test 1: budget inferiore alla pagina (limit: 10)
        const resLimited = await client.getOngoingSeries({ limit: 10 });
        assert.strictEqual(resLimited.length, 10, 'Deve fermarsi al budget di 10 serie');

        // Test 2: budget che supera la prima pagina (limit: 45 su 50 totali)
        const resMultiPage = await client.getOngoingSeries({ limit: 45 });
        assert.strictEqual(resMultiPage.length, 45, 'Deve paginare e fermarsi a 45 serie');

        // Test 3: budget superiore al totale disponibile (limit: 100 su 50 totali)
        const resAll = await client.getOngoingSeries({ limit: 100 });
        assert.strictEqual(resAll.length, 50, 'Deve recuperare tutti i 50 record disponibili senza loop infiniti');
    });

    test('SeriesDiscoveryManager persiste la lista e riusa la cache valida per 24 ore', async () => {
        const manager = new SeriesDiscoveryManager({ cacheDir: tmpDir });
        const mockList = [{ id: 1, title: 'Test 1' }, { id: 2, title: 'Test 2' }];

        // 1. All'inizio nessuna cache esiste
        assert.strictEqual(manager.loadCachedList(), null);

        // 2. Salva cache
        manager.saveCachedList(mockList);
        const cached = manager.loadCachedList();
        assert.ok(cached);
        assert.strictEqual(cached.count, 2);
        assert.strictEqual(cached.records.length, 2);

        // 3. getTrackedSeries con cache fresca: NON chiama il client
        let clientCalled = false;
        const mockClient = {
            getOngoingSeries: async () => {
                clientCalled = true;
                return [{ id: 99, title: 'Should Not Call' }];
            }
        };

        const resFresh = await manager.getTrackedSeries({ client: mockClient, limit: 300 });
        assert.strictEqual(clientCalled, false, 'Non deve chiamare il client se la cache è fresca (<24h)');
        assert.strictEqual(resFresh.fromCache, true);
        assert.strictEqual(resFresh.records.length, 2);

        // 4. Se forzato (forceRefresh: true), chiama il client e aggiorna la cache
        mockClient.getOngoingSeries = async () => [{ id: 3, title: 'Nuova Serie' }];
        const resForced = await manager.getTrackedSeries({ client: mockClient, forceRefresh: true });
        assert.strictEqual(resForced.fromCache, false);
        assert.strictEqual(resForced.records.length, 1);
        assert.strictEqual(manager.loadCachedList().records[0].title, 'Nuova Serie');
    });

    test('SeriesDiscoveryManager in caso di errore o portale giù NON azzera la lista corrente ma riusa la cache', async () => {
        const manager = new SeriesDiscoveryManager({ cacheDir: tmpDir });
        const existingList = [{ id: 10, title: 'Serie Precedente' }];
        manager.saveCachedList(existingList);

        // Simula client che lancia errore o ritorna array vuoto
        const failingClient = {
            getOngoingSeries: async () => {
                throw new Error('503 Service Temporarily Unavailable');
            }
        };

        // Forziamo il refresh per simulare un tentativo di aggiornamento fallito
        const res = await manager.getTrackedSeries({ client: failingClient, forceRefresh: true });

        // La lista NON deve essere azzerata!
        assert.strictEqual(res.fromCache, true, 'Deve riusare la cache');
        assert.strictEqual(res.fallback, true, 'Deve marcare il fallback');
        assert.strictEqual(res.records.length, 1, 'Non deve azzerare i record');
        assert.strictEqual(res.records[0].title, 'Serie Precedente');

        // Anche il file su disco deve essere intatto
        const diskCache = manager.loadCachedList();
        assert.strictEqual(diskCache.records.length, 1);
        assert.strictEqual(diskCache.records[0].title, 'Serie Precedente');
    });

    test('HealthCheck (Battito di salute - ticket 18): exit 0 se < 12h, exit 1 se vecchio o assente', () => {
        const manager = new SeriesDiscoveryManager({ cacheDir: tmpDir });

        // Caso 1: file assente -> FAIL
        const noHeartbeat = manager.checkHealth();
        assert.strictEqual(noHeartbeat.ok, false);
        assert.ok(noHeartbeat.message.includes('non esiste'));

        // Caso 2: battito recente (10 minuti fa) -> OK
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        manager.writeHeartbeat(tenMinutesAgo);

        const freshHealth = manager.checkHealth();
        assert.strictEqual(freshHealth.ok, true);
        assert.ok(freshHealth.message.includes('OK: Ultimo giro riuscito'));
        assert.strictEqual(freshHealth.ageHours, '0.2');

        // Caso 3: battito vecchio (13 ore fa > 12 ore) -> FAIL
        const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000);
        manager.writeHeartbeat(thirteenHoursAgo);

        const staleHealth = manager.checkHealth();
        assert.strictEqual(staleHealth.ok, false);
        assert.ok(staleHealth.message.includes('FAIL: Ultimo giro troppo vecchio'));
        assert.strictEqual(staleHealth.ageHours, '13.0');

        // Caso 4: timestamp corrotto o nel futuro -> FAIL
        fs.writeFileSync(manager.heartbeatFile, JSON.stringify({ timestamp: 'not-a-date' }));
        assert.strictEqual(manager.checkHealth().ok, false);
    });

    test('parseArgs riconosce le nuove opzioni --limit, --health-check, --refresh-list', () => {
        const args = ['--limit', '150', '--health-check', '--refresh-list', '--dry-run'];
        const opts = parseArgs(args);

        assert.strictEqual(opts.limit, 150);
        assert.strictEqual(opts.healthCheck, true);
        assert.strictEqual(opts.refreshList, true);
        assert.strictEqual(opts.dryRun, true);
    });
});
