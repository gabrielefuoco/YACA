const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { TvdbBridgeResolver } = require('../src/tvdbBridge');
const { IdentityResolver } = require('../src/identity');

describe('TVDB -> TMDB Bridge Resolver', () => {
    function createTestDir() {
        return fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-tvdb-bridge-test-'));
    }

    describe('/find Mockato e Risoluzione Metadati', () => {
        test('risolve correttamente una serie TV da tv_results con external_source=tvdb_id', async () => {
            const testDir = createTestDir();
            try {
                let requestedUrl = null;
                const mockFetch = async (url) => {
                    requestedUrl = url;
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            tv_results: [
                                {
                                    id: 280042,
                                    name: 'A Wild Last Boss Appeared!',
                                    original_name: '野生のラスボスが現れた！'
                                }
                            ],
                            movie_results: []
                        })
                    };
                };

                const bridge = new TvdbBridgeResolver({
                    cacheDir: testDir,
                    apiKey: 'test-api-key',
                    fetch: mockFetch
                });

                const res = await bridge.resolveTvdb('453694');
                assert.ok(res, 'Deve trovare il risultato');
                assert.strictEqual(res.tmdbId, '280042');
                assert.strictEqual(res.name, 'A Wild Last Boss Appeared!');
                assert.strictEqual(res.mediaType, 'tv');

                assert.ok(requestedUrl.includes('/3/find/453694'));
                assert.ok(requestedUrl.includes('external_source=tvdb_id'));
                assert.ok(requestedUrl.includes('api_key=test-api-key'));
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('risolve correttamente da movie_results se tv_results è vuoto', async () => {
            const testDir = createTestDir();
            try {
                const mockFetch = async () => ({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        tv_results: [],
                        movie_results: [
                            {
                                id: 99999,
                                title: 'Anime The Movie',
                                original_title: 'Anime Movie Orig'
                            }
                        ]
                    })
                });

                const bridge = new TvdbBridgeResolver({
                    cacheDir: testDir,
                    apiKey: 'test-key',
                    fetch: mockFetch
                });

                const res = await bridge.resolveTvdb('12345');
                assert.ok(res);
                assert.strictEqual(res.tmdbId, '99999');
                assert.strictEqual(res.name, 'Anime The Movie');
                assert.strictEqual(res.mediaType, 'movie');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('ritorna null per 404 o risultati vuoti', async () => {
            const testDir = createTestDir();
            try {
                let callCount = 0;
                const mockFetch = async () => {
                    callCount++;
                    return {
                        ok: false,
                        status: 404,
                        json: async () => ({ status_code: 34, status_message: 'The resource you requested could not be found.' })
                    };
                };

                const bridge = new TvdbBridgeResolver({
                    cacheDir: testDir,
                    apiKey: 'test-key',
                    fetch: mockFetch
                });

                const res = await bridge.resolveTvdb('9999999');
                assert.strictEqual(res, null);
                assert.strictEqual(callCount, 1);
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });
    });

    describe('Cache su Disco (tvdb-tmdb-cache.json)', () => {
        test('salva su file, riusa senza chiamate di rete aggiuntive e bypassa con refresh', async () => {
            const testDir = createTestDir();
            try {
                let fetchCalls = 0;
                const mockFetch = async () => {
                    fetchCalls++;
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            tv_results: [{ id: 324502, name: 'Overgeared' }]
                        })
                    };
                };

                const bridge1 = new TvdbBridgeResolver({
                    cacheDir: testDir,
                    apiKey: 'test-key',
                    fetch: mockFetch
                });

                // Prima chiamata: fetch di rete
                const r1 = await bridge1.resolveTvdb('478752');
                assert.strictEqual(r1.tmdbId, '324502');
                assert.strictEqual(r1.fromCache, false, 'La prima risoluzione deve essere una chiamata nuova');
                assert.strictEqual(fetchCalls, 1);

                bridge1.saveCache();

                // Verifica esistenza file su disco
                const cacheFile = path.join(testDir, 'tvdb-tmdb-cache.json');
                assert.ok(fs.existsSync(cacheFile), 'tvdb-tmdb-cache.json deve esistere');
                const cacheContent = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
                assert.strictEqual(cacheContent['478752'].tmdbId, '324502');
                assert.strictEqual(cacheContent['478752'].fromCache, undefined, 'Il flag fromCache non deve essere persistito');

                // Seconda istanza: carica da disco
                const bridge2 = new TvdbBridgeResolver({
                    cacheDir: testDir,
                    apiKey: 'test-key',
                    fetch: mockFetch
                });

                const r2 = await bridge2.resolveTvdb('478752');
                assert.strictEqual(r2.tmdbId, '324502');
                assert.strictEqual(r2.fromCache, true, 'La risoluzione da disco deve essere marcata come cache');
                assert.strictEqual(fetchCalls, 1, 'Non deve fare chiamate di rete grazie alla cache');

                // Con refresh: true -> deve rifare la chiamata
                const r3 = await bridge2.resolveTvdb('478752', { refresh: true });
                assert.strictEqual(r3.tmdbId, '324502');
                assert.strictEqual(r3.fromCache, false, 'Con refresh deve essere una chiamata nuova');
                assert.strictEqual(fetchCalls, 2, 'Con refresh deve eseguire nuovamente la chiamata');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('memorizza esito negativo (null) in cache per evitare ripetizioni', async () => {
            const testDir = createTestDir();
            try {
                let fetchCalls = 0;
                const mockFetch = async () => {
                    fetchCalls++;
                    return {
                        ok: false,
                        status: 404,
                        json: async () => ({})
                    };
                };

                const bridge = new TvdbBridgeResolver({
                    cacheDir: testDir,
                    apiKey: 'test-key',
                    fetch: mockFetch
                });

                const r1 = await bridge.resolveTvdb('000000');
                assert.strictEqual(r1, null);
                assert.strictEqual(fetchCalls, 1);

                const r2 = await bridge.resolveTvdb('000000');
                assert.strictEqual(r2, null);
                assert.strictEqual(fetchCalls, 1, 'Non deve richiamare la rete per esiti null già cachati');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });
    });

    describe('Priorità dei Livelli (Ufficiale → Bridge TVDB → Fallback Titolo)', () => {
        test('Priorità 1 (Ufficiale): se un anime è già mappato ufficialmente, né bridge né fallback vengono invocati', async () => {
            const testDir = createTestDir();
            try {
                let bridgeCalls = 0;
                let fallbackCalls = 0;

                const mockBridge = {
                    loadCache: async () => {},
                    saveCache: () => {},
                    resolveTvdb: async () => { bridgeCalls++; return null; }
                };

                const mockFallback = {
                    loadCache: async () => {},
                    saveCache: () => {},
                    resolveFallback: async () => { fallbackCalls++; return null; }
                };

                const resolver = new IdentityResolver({
                    cacheDir: testDir,
                    tvdbBridgeResolver: mockBridge,
                    fallbackResolver: mockFallback
                });

                // Carica mapping ufficiale
                resolver.loadFromData({
                    fribbData: [
                        { anilist_id: 100, mal_id: 200, themoviedb_id: { tv: 1111 } }
                    ],
                    anibridgeData: {}
                });

                const records = [{ id: 1, title: 'Anime Ufficiale', anilist_id: 100, mal_id: 200 }];
                const enriched = await resolver.enrichWithFallbacks(records);

                assert.strictEqual(enriched.length, 0);
                assert.strictEqual(bridgeCalls, 0, 'Il bridge non deve essere chiamato');
                assert.strictEqual(fallbackCalls, 0, 'Il fallback non deve essere chiamato');
                assert.strictEqual(resolver.getResolutionLevel({ anilistId: 100 }), 'official');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('Priorità 2 (Bridge TVDB): se manca TMDB ufficiale ma è presente tvdb_show, chiama bridge e NON fallback titolo', async () => {
            const testDir = createTestDir();
            try {
                let bridgeCalls = 0;
                let fallbackCalls = 0;

                const mockBridge = {
                    loadCache: async () => {},
                    saveCache: () => {},
                    resolveTvdb: async (tvdbId) => {
                        bridgeCalls++;
                        if (String(tvdbId) === '453694') {
                            return { tmdbId: '280042', name: 'A Wild Last Boss Appeared!' };
                        }
                        return null;
                    }
                };

                const mockFallback = {
                    loadCache: async () => {},
                    saveCache: () => {},
                    resolveFallback: async () => { fallbackCalls++; return null; }
                };

                const resolver = new IdentityResolver({
                    cacheDir: testDir,
                    tvdbBridgeResolver: mockBridge,
                    fallbackResolver: mockFallback
                });

                // Cluster AniBridge con solo tvdb_show:453694:s2 (nessun tmdb_show)
                resolver.loadFromData({
                    fribbData: [],
                    anibridgeData: {
                        'anilist:204389': {
                            'mal:63140': {},
                            'tvdb_show:453694:s2': {}
                        }
                    }
                });

                // Prima di enrich: resolve() sincrono deve restituire null
                const before = resolver.resolve({ anilistId: 204389 });
                assert.strictEqual(before, null, 'Prima di enrich non deve risolvere TMDB');

                // Verifica getTvdb()
                const tvdb = resolver.getTvdb({ anilistId: 204389 });
                assert.ok(tvdb);
                assert.strictEqual(tvdb.tvdbId, '453694');
                assert.strictEqual(tvdb.season, 2);

                const records = [{ id: 7805, title: 'Yasei no Last Boss ga Arawareta! 2', anilist_id: 204389, mal_id: 63140 }];
                const enriched = await resolver.enrichWithFallbacks(records);

                assert.strictEqual(enriched.length, 1);
                assert.strictEqual(enriched[0].level, 'bridge_tvdb');
                assert.strictEqual(enriched[0].match.tmdbId, '280042');
                assert.strictEqual(enriched[0].match.season, 2);
                assert.strictEqual(bridgeCalls, 1, 'Bridge chiamato una volta');
                assert.strictEqual(fallbackCalls, 0, 'Fallback titolo NON deve essere chiamato se il bridge risolve');

                // Dopo enrich: resolve() sincrono restituisce TMDB e stagione corretti
                const after = resolver.resolve({ anilistId: 204389 });
                assert.ok(after);
                assert.strictEqual(after.tmdbId, '280042');
                assert.strictEqual(after.season, 2);
                assert.strictEqual(after.level, 'bridge_tvdb');
                assert.strictEqual(resolver.getResolutionLevel({ anilistId: 204389 }), 'bridge_tvdb');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('Priorità 3 (Fallback Titolo): se manca tvdb o il bridge non trova, chiama il fallback per titolo', async () => {
            const testDir = createTestDir();
            try {
                let bridgeCalls = 0;
                let fallbackCalls = 0;

                const mockBridge = {
                    loadCache: async () => {},
                    saveCache: () => {},
                    resolveTvdb: async () => { bridgeCalls++; return null; }
                };

                const mockFallback = {
                    loadCache: async () => {},
                    saveCache: () => {},
                    resolveFallback: async () => {
                        fallbackCalls++;
                        return {
                            tmdbId: '198182',
                            name: 'Throne of Seal',
                            matchedTitle: 'Throne of Seal',
                            confidence: 0.85
                        };
                    }
                };

                const resolver = new IdentityResolver({
                    cacheDir: testDir,
                    tvdbBridgeResolver: mockBridge,
                    fallbackResolver: mockFallback
                });

                // Cluster AniBridge senza nodi tvdb
                resolver.loadFromData({
                    fribbData: [],
                    anibridgeData: {
                        'anilist:153499': { 'mal:52684': {} }
                    }
                });

                const records = [{ id: 7146, title: 'Shen Yin Wangzuo 2', anilist_id: 153499, mal_id: 52684 }];
                const enriched = await resolver.enrichWithFallbacks(records);

                assert.strictEqual(enriched.length, 1);
                assert.strictEqual(enriched[0].level, 'title_fallback');
                assert.strictEqual(enriched[0].match.tmdbId, '198182');
                assert.strictEqual(fallbackCalls, 1, 'Deve ricorrere al fallback titolo');
                assert.strictEqual(resolver.getResolutionLevel({ anilistId: 153499 }), 'title_fallback');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('Batch dedup: SUB e DUB dello stesso anime (stessi ID) vengono entrambi arricchiti senza duplicare chiamate', async () => {
            const testDir = createTestDir();
            try {
                let bridgeCalls = 0;
                const mockBridge = {
                    loadCache: async () => {},
                    saveCache: () => {},
                    resolveTvdb: async () => {
                        bridgeCalls++;
                        return { tmdbId: '324502', name: 'Overgeared' };
                    }
                };

                const mockFallback = {
                    loadCache: async () => {},
                    saveCache: () => {},
                    resolveFallback: async () => null
                };

                const resolver = new IdentityResolver({
                    cacheDir: testDir,
                    tvdbBridgeResolver: mockBridge,
                    fallbackResolver: mockFallback
                });

                resolver.loadFromData({
                    fribbData: [],
                    anibridgeData: {
                        'mal:64340': { 'tvdb_show:478752:s1': {} },
                        'anilist:212888': { 'mal:64340': {} }
                    }
                });

                const records = [
                    { id: 7810, dub: 0, title: 'Temppal: Item no Chikara', anilist_id: 212888, mal_id: 64340 },
                    { id: 7811, dub: 1, title: 'Temppal: Item no Chikara (ITA)', anilist_id: 212888, mal_id: 64340 }
                ];

                const enriched = await resolver.enrichWithFallbacks(records);
                assert.strictEqual(enriched.length, 2, 'Entrambi i record (SUB e DUB) devono essere nell\'elenco arricchiti');
                assert.strictEqual(enriched[0].level, 'bridge_tvdb');
                assert.strictEqual(enriched[1].level, 'bridge_tvdb');
                assert.strictEqual(bridgeCalls, 1, 'Il bridge deve essere invocato una sola volta');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });
    });
});
