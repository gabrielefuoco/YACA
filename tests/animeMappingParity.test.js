/**
 * tests/animeMappingParity.test.js
 *
 * Test di parità produttore/consumatore (Ticket 07).
 *
 * Verifica:
 * 1. Parità tra artefatto (buildMappingIndex + applyArtifact) e caricamento in-memory
 *    (loadOverrides + buildFribbIndex + buildAnibridgeIndex) su:
 *    - idsByType()
 *    - malToTmdb entries (incluso il fix su nodi mal: di AniBridge)
 *    - resolveKitsu(tmdbId, season, episode) per (1, 5) e (2, 3) con fixture Dandadan.
 * 2. Risoluzione dei percorsi di mappingPath():
 *    - ANIME_MAPPING_PATH ha massima priorità
 *    - ANIME_MAPPINGS_PATH ha priorità sul default
 *    - con solo anime_mapping.json in directory -> ritorna il file legacy
 *    - con solo anime-mappings.json in directory -> ritorna il file canonico
 *    - con entrambi i file -> vince il canonico
 *    - con nessuno dei due -> ritorna il canonico
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildMappingIndex } = require('../services/anime-source/src/mappingIndex');
const { AnimeMappingStore, mappingPath, FILE_NAME, LEGACY_FILE_NAME } = require('../src/anime/mapping');

describe('Ticket 07: Parità mapping anime e risoluzione percorsi', () => {
    describe('Parità produttore / consumatore su fixture reali Dandadan', () => {
        const fribbFixturePath = path.join(__dirname, '../services/anime-source/tests/fixtures/fribb_dandadan.json');
        const anibridgeFixturePath = path.join(__dirname, '../services/anime-source/tests/fixtures/anibridge_dandadan.json');

        const fribb = JSON.parse(fs.readFileSync(fribbFixturePath, 'utf8'));
        const anibridge = JSON.parse(fs.readFileSync(anibridgeFixturePath, 'utf8'));
        const overrides = {
            certify: [{ tmdbId: '286361' }],
            exclude: [{ tmdbId: '999999' }]
        };

        test('buildMappingIndex + applyArtifact produce le stesse mappe di buildFribbIndex + buildAnibridgeIndex', () => {
            // Percorso A: artefatto serializzato da buildMappingIndex e applicato allo store
            const artifact = buildMappingIndex({
                fribbData: fribb,
                anibridgeData: anibridge,
                overridesData: overrides
            });
            const storeFromArtifact = new AnimeMappingStore();
            storeFromArtifact.applyArtifact(artifact);

            // Percorso B: caricamento in-memory via metodi delegati dello store
            const storeFromMethods = new AnimeMappingStore();
            storeFromMethods.loadOverrides(overrides);
            storeFromMethods.buildFribbIndex(fribb);
            storeFromMethods.buildAnibridgeIndex(anibridge);

            // 1. idsByType() identici
            expect(storeFromArtifact.idsByType()).toEqual(storeFromMethods.idsByType());

            // 2. malToTmdb identici
            expect(Array.from(storeFromArtifact.malToTmdb.entries())).toEqual(
                Array.from(storeFromMethods.malToTmdb.entries())
            );

            // 3. resolveKitsu identico per Dandadan (S1 E5) e (S2 E3)
            const kitsuS1E5FromArtifact = storeFromArtifact.resolveKitsu('240411', 1, 5);
            const kitsuS1E5FromMethods = storeFromMethods.resolveKitsu('240411', 1, 5);
            expect(kitsuS1E5FromArtifact).toEqual(kitsuS1E5FromMethods);
            expect(kitsuS1E5FromArtifact).toEqual({
                success: true,
                kitsuId: 48269,
                kitsuEpisode: 5
            });

            const kitsuS2E3FromArtifact = storeFromArtifact.resolveKitsu('240411', 2, 3);
            const kitsuS2E3FromMethods = storeFromMethods.resolveKitsu('240411', 2, 3);
            expect(kitsuS2E3FromArtifact).toEqual(kitsuS2E3FromMethods);
            expect(kitsuS2E3FromArtifact).toEqual({
                success: true,
                kitsuId: 49425,
                kitsuEpisode: 3
            });
        });

        test('malToTmdb include i mapping da AniBridge anche quando Fribb non li contiene (fix drift)', () => {
            const anibridgeWithExtraMal = {
                ...anibridge,
                'mal:888123': {
                    'tmdb_show:777456:s1': { '1-12': '1-12' }
                }
            };

            const artifact = buildMappingIndex({
                fribbData: fribb,
                anibridgeData: anibridgeWithExtraMal,
                overridesData: overrides
            });
            const storeFromArtifact = new AnimeMappingStore();
            storeFromArtifact.applyArtifact(artifact);

            const storeFromMethods = new AnimeMappingStore();
            storeFromMethods.loadOverrides(overrides);
            storeFromMethods.buildFribbIndex(fribb);
            storeFromMethods.buildAnibridgeIndex(anibridgeWithExtraMal);

            // Entrambi devono contenere il mapping AniBridge-only
            expect(storeFromArtifact.malToTmdb.get('888123')).toBe('777456');
            expect(storeFromMethods.malToTmdb.get('888123')).toBe('777456');
            expect(Array.from(storeFromArtifact.malToTmdb.entries())).toEqual(
                Array.from(storeFromMethods.malToTmdb.entries())
            );
        });
    });

    describe('mappingPath(): fallback e precedenze', () => {
        let tmpDir;
        let savedEnv;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-mapping-test-'));
            savedEnv = {
                ANIME_MAPPING_PATH: process.env.ANIME_MAPPING_PATH,
                ANIME_MAPPINGS_PATH: process.env.ANIME_MAPPINGS_PATH,
                ANIME_MAPPING_DIR: process.env.ANIME_MAPPING_DIR
            };
            delete process.env.ANIME_MAPPING_PATH;
            delete process.env.ANIME_MAPPINGS_PATH;
            process.env.ANIME_MAPPING_DIR = tmpDir;
        });

        afterEach(() => {
            for (const [k, v] of Object.entries(savedEnv)) {
                if (v === undefined) {
                    delete process.env[k];
                } else {
                    process.env[k] = v;
                }
            }
            try {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch (_) {}
        });

        test('senza ANIME_MAPPING_PATH e con solo anime_mapping.json -> ritorna il legacy', () => {
            const legacyFile = path.join(tmpDir, LEGACY_FILE_NAME);
            fs.writeFileSync(legacyFile, '{}', 'utf8');

            expect(mappingPath()).toBe(legacyFile);
        });

        test('senza ANIME_MAPPING_PATH e con solo anime-mappings.json -> ritorna il canonico', () => {
            const canonicalFile = path.join(tmpDir, FILE_NAME);
            fs.writeFileSync(canonicalFile, '{}', 'utf8');

            expect(mappingPath()).toBe(canonicalFile);
        });

        test('con entrambi i file presenti -> vince il canonico', () => {
            const canonicalFile = path.join(tmpDir, FILE_NAME);
            const legacyFile = path.join(tmpDir, LEGACY_FILE_NAME);
            fs.writeFileSync(canonicalFile, '{}', 'utf8');
            fs.writeFileSync(legacyFile, '{}', 'utf8');

            expect(mappingPath()).toBe(canonicalFile);
        });

        test('con nessun file presente -> ritorna il percorso canonico di default', () => {
            const canonicalFile = path.join(tmpDir, FILE_NAME);
            expect(mappingPath()).toBe(canonicalFile);
        });

        test('ANIME_MAPPING_PATH vince su qualsiasi file o altra variabile', () => {
            process.env.ANIME_MAPPING_PATH = '/custom/explicit-mapping.json';
            process.env.ANIME_MAPPINGS_PATH = '/custom/plural-mapping.json';
            fs.writeFileSync(path.join(tmpDir, FILE_NAME), '{}', 'utf8');

            expect(mappingPath()).toBe('/custom/explicit-mapping.json');
        });

        test('ANIME_MAPPINGS_PATH (plurale) vince se ANIME_MAPPING_PATH non è definita', () => {
            process.env.ANIME_MAPPINGS_PATH = '/custom/plural-mapping.json';
            fs.writeFileSync(path.join(tmpDir, FILE_NAME), '{}', 'utf8');

            expect(mappingPath()).toBe('/custom/plural-mapping.json');
        });
    });
});
