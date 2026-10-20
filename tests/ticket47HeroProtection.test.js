/**
 * tests/ticket47HeroProtection.test.js
 *
 * Test di regressione e guardie per il Ticket 47:
 * (1) buildManifest con profilo LEGACY (intersezione vuota coi vivi) -> degrada e mostra tutti gli 8 hero.
 *     buildManifest con selezione viva non vuota -> correttamente filtrato (es. solo yaca_mondi_movies -> 1 row).
 * (2) Guardia sui 4 file frontend: asserisce che ogni id yaca_* menzionato nei file client esiste
 *     nel registro e nessuno degli 8 id morti del ticket 46 è presente.
 */

const fs = require('fs');
const path = require('path');
const { buildManifest } = require('../src/stremio/manifest');
const { getHeroUiGroups } = require('../src/catalog/registry');
const { HERO_IDS, isHeroCatalogId } = require('../src/catalog/registry');
const { FIXED_CATALOGS_REGISTRY } = require('../src/catalog/catalogKind');

const DEAD_HERO_IDS = [
    'yaca_true_blend_movies',
    'yaca_true_blend_series',
    'yaca_seed_network_movies',
    'yaca_seed_network_series',
    'yaca_hidden_gems_movies',
    'yaca_hidden_gems_series',
    'yaca_trakt_filtered_movies',
    'yaca_trakt_filtered_series'
];

describe('Ticket 47 - Protezione e Degrado Righe Hero', () => {

    describe('(1) buildManifest con profilo legacy e con selezione attiva', () => {
        test('un profilo legacy (solo ID morti rimossi dal ticket 46) restituisce tutti i 20 cataloghi hero di sistema', () => {
            const userConfigLegacy = {
                userId: 'user_legacy_47',
                activeProfileId: 'legacy_prof',
                profiles: [{
                    id: 'legacy_prof',
                    name: 'Profilo Legacy',
                    settings: {
                        typeSelectors: { film: false, serie: false, anime: null }
                    },
                    raw_ui_state: {
                        selectedPresets: [...DEAD_HERO_IDS],
                        catalogOrder: [...DEAD_HERO_IDS],
                        heroPresetsInitialized: true
                    }
                }]
            };

            const manifest = buildManifest(userConfigLegacy);
            expect(manifest).toBeDefined();
            expect(Array.isArray(manifest.catalogs)).toBe(true);

            const heroCatalogsInManifest = manifest.catalogs.filter(c => isHeroCatalogId(c.id));
            // Ticket 13: erano 8 (4 famiglie), ora 20 (10 famiglie).
            expect(heroCatalogsInManifest.length).toBe(20);

            const heroIdsInManifest = heroCatalogsInManifest.map(c => c.id);
            for (const liveId of HERO_IDS) {
                expect(heroIdsInManifest).toContain(liveId);
            }
            for (const deadId of DEAD_HERO_IDS) {
                expect(heroIdsInManifest).not.toContain(deadId);
            }
        });

        test('un profilo con uiState (nuovo schema) e solo ID morti degrada a tutti i 20 hero', () => {
            const userConfigLegacyUiState = {
                userId: 'user_legacy_uistate',
                activeProfileId: 'legacy_prof_uistate',
                profiles: [{
                    id: 'legacy_prof_uistate',
                    name: 'Profilo Legacy UiState',
                    uiState: {
                        selectedPresets: ['yaca_true_blend_movies', 'yaca_hidden_gems_series'],
                        catalogOrder: ['yaca_true_blend_movies', 'yaca_hidden_gems_series']
                    }
                }]
            };

            const manifest = buildManifest(userConfigLegacyUiState);
            const heroCatalogsInManifest = manifest.catalogs.filter(c => isHeroCatalogId(c.id));
            // Ticket 13: erano 8 (4 famiglie), ora 20 (10 famiglie).
            expect(heroCatalogsInManifest.length).toBe(20);
        });

        test('un profilo con selezione viva non vuota viene correttamente filtrato (es. solo yaca_mondi_movies -> 1 row)', () => {
            const userConfigSingleLive = {
                userId: 'user_single_live',
                activeProfileId: 'single_prof',
                profiles: [{
                    id: 'single_prof',
                    name: 'Profilo Singolo Hero',
                    raw_ui_state: {
                        selectedPresets: ['yaca_mondi_movies', 'preset_pop_movies'],
                        catalogOrder: ['yaca_mondi_movies']
                    }
                }]
            };

            const manifest = buildManifest(userConfigSingleLive);
            const heroCatalogsInManifest = manifest.catalogs.filter(c => isHeroCatalogId(c.id));
            expect(heroCatalogsInManifest.length).toBe(1);
            expect(heroCatalogsInManifest[0].id).toBe('yaca_mondi_movies');
        });

        test('un profilo con selezione mista (1 vivo + 3 morti) filtra mantenendo solo quello vivo (1 row)', () => {
            const userConfigMixed = {
                userId: 'user_mixed',
                activeProfileId: 'mixed_prof',
                profiles: [{
                    id: 'mixed_prof',
                    name: 'Profilo Misto',
                    raw_ui_state: {
                        selectedPresets: [
                            'yaca_mondi_movies',
                            'yaca_true_blend_movies',
                            'yaca_seed_network_series',
                            'yaca_hidden_gems_movies'
                        ]
                    }
                }]
            };

            const manifest = buildManifest(userConfigMixed);
            const heroCatalogsInManifest = manifest.catalogs.filter(c => isHeroCatalogId(c.id));
            expect(heroCatalogsInManifest.length).toBe(1);
            expect(heroCatalogsInManifest[0].id).toBe('yaca_mondi_movies');
        });

        test('un profilo con due hero vivi selezionati restituisce esattamente quei 2', () => {
            const userConfigTwoLive = {
                userId: 'user_two_live',
                activeProfileId: 'two_prof',
                profiles: [{
                    id: 'two_prof',
                    raw_ui_state: {
                        selectedPresets: ['yaca_passo_fuori_series', 'yaca_nicchia_di_qualita_movies']
                    }
                }]
            };

            const manifest = buildManifest(userConfigTwoLive);
            const heroCatalogsInManifest = manifest.catalogs.filter(c => isHeroCatalogId(c.id));
            expect(heroCatalogsInManifest.length).toBe(2);
            expect(heroCatalogsInManifest.map(c => c.id).sort()).toEqual([
                'yaca_nicchia_di_qualita_movies',
                'yaca_passo_fuori_series'
            ].sort());
        });
    });

    describe('(2) Guardia sui quattro file del frontend', () => {
        const FOUR_FRONTEND_FILES = [
            'frontend/src/app/page.tsx',
            'frontend/src/hooks/useProfiles.ts',
            'frontend/src/lib/utils.ts',
            'frontend/src/lib/catalogKind.ts'
        ];

        const validCatalogIds = new Set(Object.keys(FIXED_CATALOGS_REGISTRY));

        // Ignoriamo prefissi di matching (es. 'yaca_preset_') che non sono ID di cataloghi
        const IGNORED_PREFIXES = new Set(['yaca_preset_']);

        function extractYacaIds(fileContent) {
            const matches = fileContent.match(/yaca_[a-zA-Z0-9_]+/g) || [];
            return [...new Set(matches)].filter(id => !IGNORED_PREFIXES.has(id));
        }

        test.each(FOUR_FRONTEND_FILES)('il file %s non contiene ID morti e ogni ID yaca_* esiste nel registro', (filePath) => {
            const fullPath = path.resolve(__dirname, '..', filePath);
            expect(fs.existsSync(fullPath)).toBe(true);

            const content = fs.readFileSync(fullPath, 'utf8');
            const foundIds = extractYacaIds(content);

            expect(foundIds.length).toBeGreaterThan(0);

            for (const id of foundIds) {
                // Nessun id trovato deve essere uno degli 8 id morti
                expect(DEAD_HERO_IDS).not.toContain(id);

                // Ogni id trovato deve essere un catalogo registrato nel sistema
                expect(validCatalogIds.has(id)).toBe(true);
            }
        });

        // TICKET 13: gli id delle righe hero NON sono piu' letterali nei file del frontend. La dashboard
        // li DERIVA da `getHeroUiGroups()` (`${`${catalog.idBase}_movies`}` / `_series`): la guardia che
        // conta e' quindi che il registro serva **tutte** le famiglie alla dashboard, e che ogni id
        // letterale che resta nei file sia vivo (il test per-file qui sopra).
        test('la dashboard riceve tutte le famiglie del registro (gli id si derivano da idBase)', () => {
            const groups = getHeroUiGroups();
            const idBaseServiti = new Set(groups.map(g => `${g.idBase}_movies`).concat(groups.map(g => `${g.idBase}_series`)));
            for (const liveId of HERO_IDS) {
                expect(idBaseServiti.has(liveId)).toBe(true);
            }
            expect(groups).toHaveLength(10);  // 4 famiglie storiche + 6 nuove (Ticket 13)
        });

        test('le sei famiglie nuove sono nel manifesto', () => {
            const manifest = buildManifest({});
            const ids = manifest.catalogs.map(c => c.id);
            for (const slug of ['classici', 'ultime_visioni', 'punti_incontro',
                                'micro_cluster_1', 'micro_cluster_2', 'micro_cluster_3']) {
                expect(ids).toContain(`yaca_${slug}_movies`);
                expect(ids).toContain(`yaca_${slug}_series`);
            }
        });

        test("chi aveva tutte le righe di ieri riceve anche quelle di oggi (compatibilita' Ticket 13)", () => {
            const storiche = [];
            for (const slug of ['mondi', 'passo_fuori', 'uscite_nuove', 'nicchia_di_qualita']) {
                storiche.push(`yaca_${slug}_movies`, `yaca_${slug}_series`);
            }
            const config = {
                userId: 'user_full',
                activeProfileId: 'full_prof',
                profiles: [{ id: 'full_prof', name: 'Full', raw_ui_state: { selectedPresets: storiche } }]
            };
            const heroIds = buildManifest(config).catalogs.filter(c => isHeroCatalogId(c.id)).map(c => c.id);
            expect(heroIds.length).toBe(20);
        });

        test('dimostrazione: la funzione di estrazione rileverebbe la presenza di id morti (test-that-would-have-failed)', () => {
            const legacySyntheticSnippet = `
                const HERO_PRESET_IDS = [
                    'yaca_true_blend_movies',
                    'yaca_seed_network_movies'
                ];
            `;
            const extracted = extractYacaIds(legacySyntheticSnippet);
            const invalidIds = extracted.filter(id => !validCatalogIds.has(id) || DEAD_HERO_IDS.includes(id));
            expect(invalidIds).toEqual(['yaca_true_blend_movies', 'yaca_seed_network_movies']);
        });
    });
});
