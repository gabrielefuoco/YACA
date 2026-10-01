const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { loadAnimeOverrides, getEmptyOverrides } = require('../src/overrides');
const { IdentityResolver } = require('../src/identity');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'anime-overrides-test-'));
}

describe('Anime Overrides Loader (Fail-Safe)', () => {
    test('carica correttamente un file di override valido', () => {
        const tmpDir = createTempDir();
        const testFile = path.join(tmpDir, 'valid-overrides.json');
        const content = {
            version: 1,
            identities: [
                { anilist: 137653, mal: 55809, tmdbId: 223911, season: 1, title: 'Xian Ni', force: false },
                { tvdb: '434304', tmdbId: 224839, season: 1, title: 'Zhe Tian', force: true }
            ],
            certify: [
                { tmdbId: 223911, title: 'Xian Ni' },
                { tmdbId: 198182, title: 'Throne of Seal' }
            ]
        };
        fs.writeFileSync(testFile, JSON.stringify(content));

        const result = loadAnimeOverrides(testFile);
        assert.strictEqual(result.version, 1);
        assert.strictEqual(result.identities.length, 2);
        assert.strictEqual(result.certify.length, 2);
        assert.strictEqual(result.identities[0].tmdbId, '223911');
        assert.strictEqual(result.identities[0].anilist, 137653);
        assert.strictEqual(result.identities[1].force, true);
        assert.strictEqual(result.certify[0].tmdbId, '223911');

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('file assente → warning, nessun crash, restituisce struttura vuota', () => {
        const nonExistentPath = path.join(os.tmpdir(), 'non-existent-overrides-' + Date.now() + '.json');
        const result = loadAnimeOverrides(nonExistentPath);

        assert.deepStrictEqual(result, getEmptyOverrides());
        assert.strictEqual(result.identities.length, 0);
        assert.strictEqual(result.certify.length, 0);
    });

    test('file malformato (JSON sintatticamente errato) → warning, nessun crash, restituisce struttura vuota', () => {
        const tmpDir = createTempDir();
        const testFile = path.join(tmpDir, 'corrupt.json');
        fs.writeFileSync(testFile, '{ version: 1, identities: [ BROKEN JSON');

        const result = loadAnimeOverrides(testFile);
        assert.deepStrictEqual(result, getEmptyOverrides());

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('file con radice non oggetto (es. array o primitivo) → restituisce struttura vuota', () => {
        const tmpDir = createTempDir();
        const testFile = path.join(tmpDir, 'array-root.json');
        fs.writeFileSync(testFile, JSON.stringify([1, 2, 3]));

        const result = loadAnimeOverrides(testFile);
        assert.deepStrictEqual(result, getEmptyOverrides());

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('filtra entry prive di tmdbId o prive di identificatori (anilist/mal/tvdb)', () => {
        const tmpDir = createTempDir();
        const testFile = path.join(tmpDir, 'dirty.json');
        fs.writeFileSync(testFile, JSON.stringify({
            version: 1,
            identities: [
                { title: 'Senza tmdbId', anilist: 123 },
                { tmdbId: 999 }, // Senza anilist/mal/tvdb
                { tmdbId: '888', anilist: 456, title: 'Valido' }
            ],
            certify: [
                { title: 'Senza tmdbId' },
                { tmdbId: 777, title: 'Valido' }
            ]
        }));

        const result = loadAnimeOverrides(testFile);
        assert.strictEqual(result.identities.length, 1);
        assert.strictEqual(result.identities[0].tmdbId, '888');
        assert.strictEqual(result.certify.length, 1);
        assert.strictEqual(result.certify[0].tmdbId, '777');

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
});

describe('Priorità di Risoluzione (Ufficiale vs Override vs Force vs Fallback)', () => {
    test('1. Override locale batte TVDB bridge e fallback per titolo (senza mapping ufficiale)', async () => {
        const overridesData = {
            version: 1,
            identities: [
                { anilist: 137653, tmdbId: 223911, season: 1, title: 'Xian Ni' }
            ],
            certify: []
        };

        const resolver = new IdentityResolver({ overridesData });
        resolver.loadFromData({ fribbData: [], anibridgeData: {} });

        // Risoluzione sincrona
        const res = resolver.resolve({ anilistId: 137653 });
        assert.ok(res);
        assert.strictEqual(res.tmdbId, '223911');
        assert.strictEqual(res.level, 'override');

        // Arricchimento batch: verifica che né TVDB né Fallback titolo vengano invocati
        let tvdbCalled = false;
        let titleFallbackCalled = false;
        resolver.tvdbBridgeResolver = {
            loadCache: async () => {},
            saveCache: () => {},
            resolveTvdb: async () => { tvdbCalled = true; return null; }
        };
        resolver.fallbackResolver = {
            loadCache: async () => {},
            saveCache: () => {},
            resolveFallback: async () => { titleFallbackCalled = true; return null; }
        };

        const records = [{ id: 1, anilist_id: 137653, title: 'Xian Ni' }];
        const enriched = await resolver.enrichWithFallbacks(records);

        assert.strictEqual(enriched.length, 1);
        assert.strictEqual(enriched[0].level, 'override');
        assert.strictEqual(enriched[0].match.tmdbId, '223911');
        assert.strictEqual(tvdbCalled, false, 'TVDB bridge non deve essere chiamato');
        assert.strictEqual(titleFallbackCalled, false, 'Fallback per titolo non deve essere chiamato');
    });

    test('2. Mapping ufficiale vince su override normale senza force', async () => {
        const overridesData = {
            version: 1,
            identities: [
                // Tento di sovrascrivere 171018 senza flag force
                { anilist: 171018, tmdbId: 999999, season: 2, title: 'Fake Dandadan Override', force: false }
            ],
            certify: []
        };

        // Fixture ufficiale con Dandadan mappato a TMDB 240411
        const fribbFixture = [{ kitsu_id: 48269, anilist_id: 171018, themedb_id: null }];
        const anibridgeFixture = {
            'anilist:171018': {
                'tmdb_show:240411:s1': { '1-12': '1-12' }
            }
        };

        const resolver = new IdentityResolver({ overridesData });
        resolver.loadFromData({ fribbData: fribbFixture, anibridgeData: anibridgeFixture });

        const res = resolver.resolve({ anilistId: 171018 });
        assert.ok(res);
        assert.strictEqual(res.tmdbId, '240411', 'Mapping ufficiale 240411 deve vincere su override normale');
        assert.strictEqual(res.level, 'official');

        const records = [{ id: 10, anilist_id: 171018, title: 'Dandadan' }];
        const enriched = await resolver.enrichWithFallbacks(records);
        // Poiché è già mappato ufficialmente, viene skippato in enrichWithFallbacks (rimane l'ufficiale)
        assert.strictEqual(enriched.length, 0);
    });

    test('3. Override con force: true vince su TUTTO (anche su mapping ufficiale esistente)', async () => {
        const overridesData = {
            version: 1,
            identities: [
                // Flag force: true esplicito per correggere un mapping ufficiale
                { anilist: 171018, tmdbId: 888888, season: 3, title: 'Forced Dandadan Correction', force: true }
            ],
            certify: []
        };

        const anibridgeFixture = {
            'anilist:171018': {
                'tmdb_show:240411:s1': { '1-12': '1-12' }
            }
        };

        const resolver = new IdentityResolver({ overridesData });
        resolver.loadFromData({ fribbData: [], anibridgeData: anibridgeFixture });

        // Risoluzione sincrona: vince il forzato
        const res = resolver.resolve({ anilistId: 171018 });
        assert.ok(res);
        assert.strictEqual(res.tmdbId, '888888');
        assert.strictEqual(res.season, 3);
        assert.strictEqual(res.level, 'override');

        // Risoluzione batch: vince il forzato
        const records = [{ id: 10, anilist_id: 171018, title: 'Dandadan' }];
        const enriched = await resolver.enrichWithFallbacks(records);
        assert.strictEqual(enriched.length, 1);
        assert.strictEqual(enriched[0].level, 'override');
        assert.strictEqual(enriched[0].match.tmdbId, '888888');
    });

    test('4. Record assente da override ed ufficiale prosegue col fallback normale (TVDB → Fallback Titolo)', async () => {
        const resolver = new IdentityResolver({ overridesData: { version: 1, identities: [], certify: [] } });
        resolver.loadFromData({ fribbData: [], anibridgeData: {} });

        let tvdbCalled = false;
        let titleFallbackCalled = false;

        resolver.tvdbBridgeResolver = {
            loadCache: async () => {},
            saveCache: () => {},
            resolveTvdb: async () => {
                tvdbCalled = true;
                return null;
            }
        };
        resolver.fallbackResolver = {
            loadCache: async () => {},
            saveCache: () => {},
            resolveFallback: async () => {
                titleFallbackCalled = true;
                return { tmdbId: '55555', name: 'Matched By Title', confidence: 0.9 };
            }
        };

        const records = [{ id: 99, anilist_id: 99999, title: 'Unknown Anime' }];
        const enriched = await resolver.enrichWithFallbacks(records);

        assert.strictEqual(enriched.length, 1);
        assert.strictEqual(enriched[0].level, 'title_fallback');
        assert.strictEqual(enriched[0].match.tmdbId, '55555');
        assert.strictEqual(titleFallbackCalled, true, 'Deve invocare il fallback titolo');
    });

    test('5. Supporto lookup per MAL ID e TVDB ID negli override', () => {
        const overridesData = {
            version: 1,
            identities: [
                { mal: 55809, tmdbId: 223911, season: 1, title: 'By MAL' },
                { tvdb: '434304', tmdbId: 224839, season: 1, title: 'By TVDB' }
            ],
            certify: []
        };

        const resolver = new IdentityResolver({ overridesData });
        resolver.loadFromData({ fribbData: [], anibridgeData: {} });

        const fromMal = resolver.resolve({ malId: 55809 });
        assert.ok(fromMal);
        assert.strictEqual(fromMal.tmdbId, '223911');
        assert.strictEqual(fromMal.level, 'override');

        const fromTvdb = resolver.resolve({ tvdbId: '434304' });
        assert.ok(fromTvdb);
        assert.strictEqual(fromTvdb.tmdbId, '224839');
        assert.strictEqual(fromTvdb.level, 'override');
    });
});

describe('File Reale anime-overrides.json', () => {
    test('il file reale esiste, è valido e include i donghua verificabili', () => {
        const realFile = path.join(__dirname, '../data/anime-overrides.json');
        assert.ok(fs.existsSync(realFile), 'Il file services/anime-source/data/anime-overrides.json deve esistere');

        const overrides = loadAnimeOverrides(realFile);
        assert.strictEqual(overrides.version, 1);
        assert.ok(overrides.identities.length >= 4, 'Almeno 4 identità note');
        assert.ok(overrides.certify.length >= 4, 'Almeno 4 certify noti');

        const ids = overrides.identities.map(i => i.tmdbId);
        assert.ok(ids.includes('223911'), 'Include Xian Ni (223911)');
        assert.ok(ids.includes('198182'), 'Include Shen Yin Wangzuo 2 (198182)');
        assert.ok(ids.includes('106449'), 'Include Fanren Xiuxian Chuan (106449)');
        assert.ok(ids.includes('224839'), 'Include Zhe Tian (224839)');

        const certifiedIds = overrides.certify.map(c => c.tmdbId);
        assert.ok(certifiedIds.includes('106449'));
        assert.ok(certifiedIds.includes('223911'));
        assert.ok(certifiedIds.includes('198182'));
        assert.ok(certifiedIds.includes('224839'));
    });
});
