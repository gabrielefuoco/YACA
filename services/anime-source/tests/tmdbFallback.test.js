const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
    TmdbFallbackResolver,
    normalizeTitle,
    getParentTitles,
    getCandidateQueries
} = require('../src/tmdbFallback');
const { IdentityResolver } = require('../src/identity');

describe('TMDB Fallback Resolver', () => {
    describe('Normalizzazione e Query Generation', () => {
        test('normalizeTitle pulisce minuscole, diacritici, punteggiatura e tag (ITA)/(SUB)/(DUB)', () => {
            assert.strictEqual(normalizeTitle('Ghost Meets Gal!'), 'ghost meets gal');
            assert.strictEqual(normalizeTitle('Ètè d\'été'), 'ete d ete');
            assert.strictEqual(normalizeTitle('Kaijuu 8-gou: Narumi no Heijitsu (ITA)'), 'kaijuu 8 gou narumi no heijitsu');
            assert.strictEqual(normalizeTitle('Overgeared (DUB)'), 'overgeared');
            assert.strictEqual(normalizeTitle(null), '');
            assert.strictEqual(normalizeTitle(''), '');
        });

        test('getParentTitles estrae correttamente la serie padre senza marcatori sequel/special', () => {
            const p1 = getParentTitles('Shen Yin Wangzuo 2');
            assert.ok(p1.includes('Shen Yin Wangzuo'), 'Deve estrarre Shen Yin Wangzuo');

            const p2 = getParentTitles('Yasei no Last Boss ga Arawareta! 2');
            assert.ok(p2.includes('Yasei no Last Boss ga Arawareta!'), 'Deve estrarre Yasei no Last Boss ga Arawareta!');

            const p3 = getParentTitles("Kaiju No. 8: Narumi's Week at Work (ITA)");
            assert.ok(p3.includes('Kaiju No. 8'), 'Deve estrarre Kaiju No. 8 preservando il numero 8');

            const p4 = getParentTitles('The Prince of Tennis II U-17 WORLD CUP: Final Member Selection Match');
            assert.ok(p4.includes('The Prince of Tennis II U-17 WORLD CUP'), 'Deve estrarre il prefisso della coppa');
        });

        test('getCandidateQueries include varianti di titolo, titolo inglese, slug e serie padre', () => {
            const queries = getCandidateQueries({
                title: 'Shen Yin Wangzuo 2',
                title_eng: 'Throne of Seal 2',
                slug: 'throne-of-seal-2'
            });
            assert.ok(queries.includes('Shen Yin Wangzuo 2'));
            assert.ok(queries.includes('Shen Yin Wangzuo'));
            assert.ok(queries.includes('Throne of Seal 2'));
            assert.ok(queries.includes('Throne of Seal'));
        });
    });

    describe('Risoluzione e Regole Prudenti', () => {
        function createTestDir() {
            return fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-tmdb-fallback-test-'));
        }

        test('Match diretto con lingua ja e anno coincidente (es. Ghost Meets Gal)', async () => {
            const testDir = createTestDir();
            try {
                const mockFetch = async () => ({
                    ok: true,
                    json: async () => ({
                        results: [
                            {
                                id: 334103,
                                name: 'Ghost Meets Gal!',
                                original_name: 'ごーすと・みーつ・ぎゃる！',
                                original_language: 'ja',
                                genre_ids: [16, 35],
                                first_air_date: '2026-09-05'
                            }
                        ]
                    })
                });

                const resolver = new TmdbFallbackResolver({
                    cacheDir: testDir,
                    apiKey: 'fake-api-key',
                    fetch: mockFetch
                });

                const res = await resolver.resolveFallback({
                    title_eng: 'Ghost Meets Gal!',
                    slug: 'ghost-meets-gal',
                    date: '2026',
                    anilistId: 214703
                });

                assert.ok(res, 'Deve trovare il match');
                assert.strictEqual(res.tmdbId, '334103');
                assert.strictEqual(res.name, 'Ghost Meets Gal!');
                assert.strictEqual(res.confidence, 1.0);
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('Match serie padre per sequel/special (es. Throne of Seal / Shen Yin Wangzuo 2)', async () => {
            const testDir = createTestDir();
            try {
                const mockFetch = async () => ({
                    ok: true,
                    json: async () => ({
                        results: [
                            {
                                id: 198182,
                                name: 'Throne of Seal',
                                original_name: '神印王座',
                                original_language: 'zh',
                                genre_ids: [16, 10759],
                                first_air_date: '2022-04-28'
                            }
                        ]
                    })
                });

                const resolver = new TmdbFallbackResolver({
                    cacheDir: testDir,
                    apiKey: 'fake-api-key',
                    fetch: mockFetch
                });

                const res = await resolver.resolveFallback({
                    title: 'Shen Yin Wangzuo 2',
                    title_eng: 'Throne of Seal 2',
                    slug: 'throne-of-seal-2',
                    date: '2022',
                    anilistId: 153499
                });

                assert.ok(res, 'Deve trovare match serie padre');
                assert.strictEqual(res.tmdbId, '198182');
                assert.strictEqual(res.name, 'Throne of Seal');
                assert.strictEqual(res.confidence, 0.85);
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('Scarta candidato se non ha lingua ja/zh né genere 16 (Animation)', async () => {
            const testDir = createTestDir();
            try {
                const mockFetch = async () => ({
                    ok: true,
                    json: async () => ({
                        results: [
                            {
                                id: 99999,
                                name: 'Live Action Random Show',
                                original_name: 'Live Action Random Show',
                                original_language: 'en',
                                genre_ids: [18, 10759], // niente 16, lingua en
                                first_air_date: '2026-01-01'
                            }
                        ]
                    })
                });

                const resolver = new TmdbFallbackResolver({
                    cacheDir: testDir,
                    apiKey: 'fake-api-key',
                    fetch: mockFetch
                });

                const res = await resolver.resolveFallback({
                    title: 'Live Action Random Show',
                    date: '2026'
                });

                assert.strictEqual(res, null, 'Deve scartare serie non animate né ja/zh');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('Scarta candidato se anno discordante oltre soglia ±1 (match diretto) o oltre 4 anni (serie padre)', async () => {
            const testDir = createTestDir();
            try {
                const mockFetch = async () => ({
                    ok: true,
                    json: async () => ({
                        results: [
                            {
                                id: 88888,
                                name: 'Old Show',
                                original_name: 'Old Show',
                                original_language: 'ja',
                                genre_ids: [16],
                                first_air_date: '2010-01-01' // 2010 vs 2026 (> 1 anno per match diretto)
                            }
                        ]
                    })
                });

                const resolver = new TmdbFallbackResolver({
                    cacheDir: testDir,
                    apiKey: 'fake-api-key',
                    fetch: mockFetch
                });

                const res = await resolver.resolveFallback({
                    title: 'Old Show',
                    date: '2026'
                });

                assert.strictEqual(res, null, 'Deve scartare se anno non compatibile');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('Cache persistente su title-fallback-mappings.json e bypass con refreshFallbacks', async () => {
            const testDir = createTestDir();
            try {
                let networkCalls = 0;
                const mockFetch = async () => {
                    networkCalls++;
                    return {
                        ok: true,
                        json: async () => ({
                            results: [
                                {
                                    id: 334103,
                                    name: 'Ghost Meets Gal!',
                                    original_name: 'ごーすと・みーつ・ぎゃる！',
                                    original_language: 'ja',
                                    genre_ids: [16, 35],
                                    first_air_date: '2026-09-05'
                                }
                            ]
                        })
                    };
                };

                const resolver = new TmdbFallbackResolver({
                    cacheDir: testDir,
                    apiKey: 'fake-api-key',
                    fetch: mockFetch
                });

                // 1. Prima chiamata: colpisce la rete
                const res1 = await resolver.resolveFallback({
                    title_eng: 'Ghost Meets Gal!',
                    date: '2026',
                    anilistId: 214703
                });
                assert.ok(res1);
                assert.ok(networkCalls > 0);
                resolver.saveCache();

                // Verifica che il file di cache esista su disco
                const cacheFile = path.join(testDir, 'title-fallback-mappings.json');
                assert.ok(fs.existsSync(cacheFile), 'File di cache deve essere scritto');

                // 2. Seconda chiamata con un nuovo resolver (stessa cartella di cache): usa la cache!
                const callsBefore = networkCalls;
                const resolver2 = new TmdbFallbackResolver({
                    cacheDir: testDir,
                    apiKey: 'fake-api-key',
                    fetch: mockFetch
                });
                const res2 = await resolver2.resolveFallback({
                    title_eng: 'Ghost Meets Gal!',
                    date: '2026',
                    anilistId: 214703
                });
                assert.strictEqual(res2.tmdbId, '334103');
                assert.strictEqual(networkCalls, callsBefore, 'Non deve fare chiamate di rete se in cache');

                // 3. Terza chiamata con refreshFallbacks: true -> forza riscansione
                await resolver2.resolveFallback({
                    title_eng: 'Ghost Meets Gal!',
                    date: '2026',
                    anilistId: 214703
                }, { refreshFallbacks: true });
                assert.ok(networkCalls > callsBefore, 'Con refreshFallbacks deve forzare la riscansione');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });
    });

    describe('Integrazione IdentityResolver.enrichWithFallbacks', () => {
        function createTestDir() {
            return fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-identity-enrich-test-'));
        }

        test('Il mapping ufficiale vince sempre e non viene sovrascritto dal fallback', async () => {
            const testDir = createTestDir();
            try {
                let fallbackCalls = 0;
                const mockFallbackResolver = {
                    loadCache: async () => {},
                    saveCache: () => {},
                    resolveFallback: async () => {
                        fallbackCalls++;
                        return { tmdbId: '999999', name: 'Fake', matchedTitle: 'Fake', confidence: 1 };
                    }
                };

                const resolver = new IdentityResolver({
                    cacheDir: testDir,
                    fallbackResolver: mockFallbackResolver
                });

                // Dandadan è noto ufficialmente (anilist 171018 -> tmdb 240411)
                resolver.loadFromData({
                    fribbData: [{ anilist_id: 171018, themoviedb_id: '240411' }],
                    anibridgeData: {}
                });

                const records = [
                    { id: 100, title: 'Dandadan', anilist_id: 171018, mal_id: 57334 }
                ];

                const enriched = await resolver.enrichWithFallbacks(records);

                assert.strictEqual(enriched.length, 0, 'Nessun fallback deve arricchire un record già mappato');
                assert.strictEqual(fallbackCalls, 0, 'Il fallback resolver non deve essere invocato');
                const identity = resolver.resolve({ anilistId: 171018 });
                assert.strictEqual(identity.tmdbId, '240411', 'Il mapping ufficiale deve rimanere invariato');
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('I record non mappati vengono arricchiti nelle mappe in memoria; dryRun non scrive cache su disco', async () => {
            const testDir = createTestDir();
            try {
                let saved = false;
                const mockFallbackResolver = {
                    loadCache: async () => {},
                    saveCache: () => { saved = true; },
                    resolveFallback: async (rec) => {
                        if (String(rec.anilistId) === '214703') {
                            return { tmdbId: '334103', name: 'Ghost Meets Gal!', matchedTitle: 'Ghost Meets Gal!', confidence: 1 };
                        }
                        return null;
                    }
                };

                const resolver = new IdentityResolver({
                    cacheDir: testDir,
                    fallbackResolver: mockFallbackResolver
                });
                resolver.loadFromData({ fribbData: [], anibridgeData: {} });

                const records = [
                    { id: 7769, title_eng: 'Ghost Meets Gal!', anilist_id: 214703, mal_id: 64718 },
                    { id: 7726, title: 'Yi Nian Yongheng 4', anilist_id: 199409, mal_id: 62248 }
                ];

                // Esecuzione dryRun
                const enriched = await resolver.enrichWithFallbacks(records, { dryRun: true });

                assert.strictEqual(enriched.length, 1);
                assert.strictEqual(enriched[0].match.tmdbId, '334103');
                assert.strictEqual(saved, false, 'In dryRun non deve chiamare saveCache');

                // Risoluzione ora funziona per il record arricchito
                const idGhost = resolver.resolve({ anilistId: 214703 });
                assert.ok(idGhost);
                assert.strictEqual(idGhost.tmdbId, '334103');

                // Risoluzione per quello non trovato rimane null
                const idYi = resolver.resolve({ anilistId: 199409 });
                assert.strictEqual(idYi, null);
            } finally {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        });

        test('parseArgs di cli.js riconosce il flag --refresh-fallbacks', () => {
            const { parseArgs } = require('../cli');
            const opts = parseArgs(['--dry-run', '--refresh-fallbacks']);
            assert.strictEqual(opts.dryRun, true);
            assert.strictEqual(opts.refreshFallbacks, true);
        });
    });
});

