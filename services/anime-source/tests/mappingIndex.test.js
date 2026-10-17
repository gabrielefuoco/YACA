const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
    SCHEMA_VERSION,
    buildMappingIndex,
    writeMappingIndexAtomic,
    resolveMappingIndexPath,
    produceMappingIndex
} = require('../src/mappingIndex');
const { IdentityResolver } = require('../src/identity');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mapping-index-test-'));
}

describe('Mapping Index Producer (Ticket 32)', () => {
    const fribbFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/fribb_dandadan.json'), 'utf8'));
    const anibridgeFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/anibridge_dandadan.json'), 'utf8'));

    test('buildMappingIndex costruisce la forma completa dell\'artefatto', () => {
        const overridesData = {
            version: 1,
            identities: [],
            certify: [{ tmdbId: '286361', title: 'LuluttoLilly' }],
            exclude: []
        };

        const artifact = buildMappingIndex({
            fribbData: fribbFixture,
            anibridgeData: anibridgeFixture,
            overridesData,
            sources: {
                anibridge: { url: 'https://example.com/ani', fetchedAt: '2026-10-17T00:00:00.000Z', rowCount: 1 },
                fribb: { url: 'https://example.com/fribb', fetchedAt: '2026-10-17T00:00:00.000Z', rowCount: 1 }
            }
        });

        // 1. Metadati di schema e generazione
        assert.strictEqual(artifact.schemaVersion, SCHEMA_VERSION);
        assert.ok(typeof artifact.generatedAt === 'string');
        assert.ok(!isNaN(Date.parse(artifact.generatedAt)));

        // 2. Provenance per sorgente
        assert.ok(artifact.sources);
        assert.strictEqual(artifact.sources.anibridge.url, 'https://example.com/ani');
        assert.strictEqual(artifact.sources.anibridge.rowCount, 1);
        assert.strictEqual(artifact.sources.fribb.url, 'https://example.com/fribb');
        assert.strictEqual(artifact.sources.fribb.rowCount, 1);
        assert.ok(artifact.sources.overrides);
        assert.deepStrictEqual(artifact.provenance, artifact.sources);

        // 3. Insiemi TMDB (movie e show)
        assert.ok(Array.isArray(artifact.animeTmdbIdsMovie));
        assert.ok(Array.isArray(artifact.animeTmdbIdsShow));
        assert.ok(artifact.animeTmdbIdsShow.includes('240411'), 'Dandadan deve essere presente come show');
        assert.ok(artifact.animeTmdbIdsMovie.includes('286361'), 'LuluttoLilly certificato deve essere presente in movie');
        assert.ok(artifact.animeTmdbIdsShow.includes('286361'), 'LuluttoLilly certificato deve essere presente in show');

        // 4. Insiemi Anibridge grezzi
        assert.ok(Array.isArray(artifact.anibridgeTmdbIds));
        assert.ok(Array.isArray(artifact.anibridgeShowTmdbIds));
        assert.ok(Array.isArray(artifact.anibridgeMovieTmdbIds));
        assert.ok(artifact.anibridgeShowTmdbIds.includes('240411'));

        // 5. Override certificati ed esclusi
        assert.ok(Array.isArray(artifact.certifiedTmdbIds));
        assert.ok(Array.isArray(artifact.excludedTmdbIds));
        assert.ok(artifact.certifiedTmdbIds.includes('286361'));
        assert.strictEqual(artifact.certify.length, 1);
        assert.strictEqual(artifact.certify[0].tmdbId, '286361');
        assert.strictEqual(artifact.exclude.length, 0);

        // 6. Mappe di risoluzione serializzate come coppie [key, value]
        assert.ok(Array.isArray(artifact.tmdbToKitsu));
        assert.ok(Array.isArray(artifact.tmdbToKitsuMovie));
        assert.ok(Array.isArray(artifact.kitsuToTmdb));
        assert.ok(Array.isArray(artifact.kitsuToTmdbType));
        assert.ok(Array.isArray(artifact.malToTmdb));
        assert.ok(Array.isArray(artifact.tmdbToAnimeNode));

        // Verifica che le coppie siano ricostruibili come Map native
        const tmdbToKitsuMap = new Map(artifact.tmdbToKitsu);
        // Nella fixture ci sono S1 (48269) e S2 (49425); l'ultimo sovrascrive tmdbToKitsu piatto
        assert.strictEqual(tmdbToKitsuMap.get('240411'), 49425);

        const kitsuToTmdbMap = new Map(artifact.kitsuToTmdb);
        assert.strictEqual(kitsuToTmdbMap.get('48269'), '240411');
        assert.strictEqual(kitsuToTmdbMap.get('49425'), '240411');

        const kitsuTypeMap = new Map(artifact.kitsuToTmdbType);
        assert.strictEqual(kitsuTypeMap.get('48269'), 'tv');

        const malToTmdbMap = new Map(artifact.malToTmdb);
        assert.strictEqual(malToTmdbMap.get('57334'), '240411');

        const nodeMap = new Map(artifact.tmdbToAnimeNode);
        assert.ok(nodeMap.has('240411:1'));
        const nodeRules = nodeMap.get('240411:1');
        assert.ok(Array.isArray(nodeRules) && nodeRules.length > 0);
        assert.strictEqual(nodeRules[0].bridgeNode.p, 'anidb');
        assert.strictEqual(nodeRules[0].bridgeNode.id, '18290');

        // 7. Lookups Fribb
        assert.ok(artifact.fribbIndex);
        assert.ok(Array.isArray(artifact.fribbIndex.anidb));
        assert.ok(Array.isArray(artifact.fribbIndex.anilist));
        assert.ok(Array.isArray(artifact.fribbIndex.mal));

        const anilistMap = new Map(artifact.fribbIndex.anilist);
        assert.strictEqual(anilistMap.get('171018'), 48269);

        const malMap = new Map(artifact.fribbIndex.mal);
        assert.strictEqual(malMap.get('57334'), 48269);
    });

    describe('Regola di Conflitto: Exclude Vince Sempre su Certify', () => {
        test('se un ID compare sia in certify che in exclude, exclude vince ed elimina da insiemi anime', () => {
            const overridesData = {
                version: 1,
                identities: [],
                certify: [
                    { tmdbId: '1001', title: 'Solo certificato' },
                    { tmdbId: '1002', title: 'Certificato ma anche escluso' }
                ],
                exclude: [
                    { tmdbId: '1002', title: 'Escluso vince' },
                    { tmdbId: '1003', title: 'Solo escluso' },
                    { tmdbId: '240411', title: 'Escludo anche Dandadan da dump' }
                ]
            };

            const artifact = buildMappingIndex({
                fribbData: fribbFixture,
                anibridgeData: anibridgeFixture,
                overridesData
            });

            // 1001 è solo in certify
            assert.ok(artifact.certifiedTmdbIds.includes('1001'));
            assert.ok(artifact.animeTmdbIdsMovie.includes('1001'));
            assert.ok(artifact.animeTmdbIdsShow.includes('1001'));

            // 1002 è in conflitto: exclude vince
            assert.ok(!artifact.certifiedTmdbIds.includes('1002'), '1002 non deve essere in certifiedTmdbIds');
            assert.ok(artifact.excludedTmdbIds.includes('1002'), '1002 deve essere in excludedTmdbIds');
            assert.ok(!artifact.animeTmdbIdsMovie.includes('1002'), '1002 non deve essere in animeTmdbIdsMovie');
            assert.ok(!artifact.animeTmdbIdsShow.includes('1002'), '1002 non deve essere in animeTmdbIdsShow');
            assert.ok(!artifact.certify.some(c => c.tmdbId === '1002'), '1002 rimosso da lista certify');
            assert.ok(artifact.exclude.some(e => e.tmdbId === '1002'), '1002 presente in lista exclude');

            // 240411 (Dandadan) era presente nel dump, ma è in exclude: deve essere rimosso da entrambi i set
            assert.ok(!artifact.animeTmdbIdsShow.includes('240411'), '240411 escluso non deve essere in animeTmdbIdsShow');
            assert.ok(!artifact.animeTmdbIdsMovie.includes('240411'), '240411 escluso non deve essere in animeTmdbIdsMovie');
            assert.ok(artifact.excludedTmdbIds.includes('240411'));
        });
    });

    describe('Degrado Fail-Safe senza eccezioni', () => {
        test('file override assente → degrada senza eccezioni con liste certify/exclude vuote', () => {
            const tmpDir = createTempDir();
            const nonExistentPath = path.join(tmpDir, 'non-existent.json');

            assert.doesNotThrow(() => {
                const { artifact, meta } = produceMappingIndex({
                    fribbData: fribbFixture,
                    anibridgeData: anibridgeFixture,
                    overridesDataOrPath: nonExistentPath,
                    targetPath: path.join(tmpDir, 'out.json')
                });

                assert.strictEqual(artifact.certifiedTmdbIds.length, 0);
                assert.strictEqual(artifact.excludedTmdbIds.length, 0);
                assert.strictEqual(artifact.certify.length, 0);
                assert.strictEqual(artifact.exclude.length, 0);
                assert.ok(artifact.animeTmdbIdsShow.includes('240411'));
                assert.ok(fs.existsSync(meta.path));
            });

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        test('file override vuoto o malformato → degrada senza eccezioni', () => {
            const tmpDir = createTempDir();
            const emptyPath = path.join(tmpDir, 'empty.json');
            fs.writeFileSync(emptyPath, '');

            const corruptPath = path.join(tmpDir, 'corrupt.json');
            fs.writeFileSync(corruptPath, '{ INVALID JSON');

            assert.doesNotThrow(() => {
                const res1 = produceMappingIndex({
                    fribbData: fribbFixture,
                    anibridgeData: anibridgeFixture,
                    overridesDataOrPath: emptyPath,
                    targetPath: path.join(tmpDir, 'out1.json')
                });
                assert.strictEqual(res1.artifact.certifiedTmdbIds.length, 0);
                assert.ok(fs.existsSync(res1.meta.path));

                const res2 = produceMappingIndex({
                    fribbData: fribbFixture,
                    anibridgeData: anibridgeFixture,
                    overridesDataOrPath: corruptPath,
                    targetPath: path.join(tmpDir, 'out2.json')
                });
                assert.strictEqual(res2.artifact.certifiedTmdbIds.length, 0);
                assert.ok(fs.existsSync(res2.meta.path));
            });

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        test('overridesData null o undefined → degrada senza eccezioni', () => {
            const artifact = buildMappingIndex({
                fribbData: fribbFixture,
                anibridgeData: anibridgeFixture,
                overridesData: null
            });
            assert.strictEqual(artifact.certifiedTmdbIds.length, 0);
            assert.strictEqual(artifact.excludedTmdbIds.length, 0);
            assert.ok(artifact.animeTmdbIdsShow.includes('240411'));
        });
    });

    describe('Scrittura Atomica su File', () => {
        test('writeMappingIndexAtomic crea la directory, scrive atomicamente e sovrascrive pulito', () => {
            const tmpDir = createTempDir();
            const targetPath = path.join(tmpDir, 'sub/dir/mappings.json');

            const testArtifact = {
                schemaVersion: 1,
                generatedAt: new Date().toISOString(),
                animeTmdbIdsMovie: ['10', '20'],
                animeTmdbIdsShow: ['30']
            };

            const meta1 = writeMappingIndexAtomic(targetPath, testArtifact);
            assert.strictEqual(meta1.path, targetPath);
            assert.ok(meta1.size > 0);
            assert.ok(fs.existsSync(targetPath));

            // Nessun file .tmp residuo
            const files = fs.readdirSync(path.dirname(targetPath));
            assert.deepStrictEqual(files, ['mappings.json']);

            const readContent = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
            assert.strictEqual(readContent.schemaVersion, 1);
            assert.deepStrictEqual(readContent.animeTmdbIdsMovie, ['10', '20']);

            // Seconda scrittura atomica (sovrascrittura)
            testArtifact.animeTmdbIdsMovie.push('40');
            const meta2 = writeMappingIndexAtomic(targetPath, testArtifact);
            assert.ok(meta2.size > meta1.size);

            const readAgain = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
            assert.deepStrictEqual(readAgain.animeTmdbIdsMovie, ['10', '20', '40']);

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        test('resolveMappingIndexPath rispetta ANIME_MAPPINGS_PATH e fallback su cacheDir', () => {
            const tmpDir = createTempDir();
            const customEnv = path.join(tmpDir, 'custom-from-env.json');
            process.env.ANIME_MAPPINGS_PATH = customEnv;

            const resolvedWithEnv = resolveMappingIndexPath(undefined, tmpDir);
            assert.strictEqual(resolvedWithEnv, customEnv);

            delete process.env.ANIME_MAPPINGS_PATH;

            const resolvedDefault = resolveMappingIndexPath(undefined, tmpDir);
            assert.strictEqual(resolvedDefault, path.join(tmpDir, 'anime-mappings.json'));

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });
    });

    describe('Integrazione con IdentityResolver', () => {
        test('publishMappingIndex genera l\'artefatto leggibile e coerente con resolver', () => {
            const tmpDir = createTempDir();
            try {
                const resolver = new IdentityResolver({
                    cacheDir: tmpDir,
                    mappingIndexPath: path.join(tmpDir, 'output-index.json'),
                    overridesData: {
                        version: 1,
                        identities: [],
                        certify: [{ tmdbId: '286361', title: 'LuluttoLilly' }],
                        exclude: [{ tmdbId: '999999', title: 'Fake Exclude' }]
                    }
                });

                resolver.loadFromData({ fribbData: fribbFixture, anibridgeData: anibridgeFixture });
                const { artifact, meta } = resolver.publishMappingIndex();

                assert.ok(fs.existsSync(meta.path));
                assert.ok(meta.size > 0);
                assert.strictEqual(artifact.animeTmdbIdsShow.includes('240411'), true);
                assert.strictEqual(artifact.certifiedTmdbIds.includes('286361'), true);
                assert.strictEqual(artifact.excludedTmdbIds.includes('999999'), true);

                // Lettura diretta da disco del file prodotto
                const diskJson = JSON.parse(fs.readFileSync(meta.path, 'utf8'));
                assert.strictEqual(diskJson.schemaVersion, 1);
                assert.ok(diskJson.animeTmdbIdsShow.includes('240411'));
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });
});
