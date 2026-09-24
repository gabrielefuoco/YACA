const fs = require('fs');
const path = require('path');
const ts = require('C:/Users/gabri/APP/YACA/frontend/node_modules/typescript');

describe('TypeSelectors Payload & Mapping Regression Tests', () => {
    let profilesToApiPayload;
    let mapBackendProfile;
    let sanitizeTypeSelectors;

    beforeAll(() => {
        const utilsPath = path.resolve(__dirname, '../frontend/src/lib/utils.ts');
        expect(fs.existsSync(utilsPath)).toBe(true);

        const source = fs.readFileSync(utilsPath, 'utf8');
        const transpiled = ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS }
        });

        const m = { exports: {} };
        const customRequire = (id) => {
            try {
                return require(id);
            } catch (e) {
                return require(path.join('C:/Users/gabri/APP/YACA/frontend/node_modules', id));
            }
        };

        const fn = new Function('require', 'exports', 'module', transpiled.outputText);
        fn(customRequire, m.exports, m);

        profilesToApiPayload = m.exports.profilesToApiPayload;
        mapBackendProfile = m.exports.mapBackendProfile;
        sanitizeTypeSelectors = m.exports.sanitizeTypeSelectors;

        expect(typeof profilesToApiPayload).toBe('function');
        expect(typeof mapBackendProfile).toBe('function');
    });

    const createTestProfile = (typeSelectors) => ({
        id: 'test_prof',
        name: 'Test Profile',
        raw_ui_state: {
            selectedPresets: ['preset_pop_movies'],
            newPrompts: [],
            presetOverrides: {},
            catalogOrder: ['preset_pop_movies'],
            heroPresetsInitialized: true
        },
        existingCatalogs: [],
        settings: {
            fastRefresh: false,
            typeSelectors
        }
    });

    describe('(a) profilesToApiPayload include typeSelectors nei 4 stati', () => {
        it('Stato 1: Solo Film ({ film: true, serie: false, anime: null })', () => {
            const profile = createTestProfile({ film: true, serie: false, anime: null });
            const [payload] = profilesToApiPayload([profile]);

            expect(payload.settings).toBeDefined();
            expect(payload.settings.typeSelectors).toEqual({
                film: true,
                serie: false,
                anime: null
            });
        });

        it('Stato 2: Solo Serie ({ film: false, serie: true, anime: null })', () => {
            const profile = createTestProfile({ film: false, serie: true, anime: null });
            const [payload] = profilesToApiPayload([profile]);

            expect(payload.settings).toBeDefined();
            expect(payload.settings.typeSelectors).toEqual({
                film: false,
                serie: true,
                anime: null
            });
        });

        it('Stato 3: Solo Anime ({ film: false, serie: false, anime: "only" })', () => {
            const profile = createTestProfile({ film: false, serie: false, anime: 'only' });
            const [payload] = profilesToApiPayload([profile]);

            expect(payload.settings).toBeDefined();
            expect(payload.settings.typeSelectors).toEqual({
                film: false,
                serie: false,
                anime: 'only'
            });
        });

        it('Stato 4: No Anime ({ film: false, serie: false, anime: "exclude" })', () => {
            const profile = createTestProfile({ film: false, serie: false, anime: 'exclude' });
            const [payload] = profilesToApiPayload([profile]);

            expect(payload.settings).toBeDefined();
            expect(payload.settings.typeSelectors).toEqual({
                film: false,
                serie: false,
                anime: 'exclude'
            });
        });

        it('Gestisce stati con proprietà parziali ({ film: true })', () => {
            const profile = createTestProfile({ film: true });
            const [payload] = profilesToApiPayload([profile]);

            expect(payload.settings.typeSelectors).toEqual({
                film: true,
                serie: false,
                anime: null
            });
        });
    });

    describe('(b) Valori sporchi o assenti -> default sanificato', () => {
        it('sanifica valori sporchi ({ anime: "boh", film: "x" })', () => {
            const profile = createTestProfile({ anime: 'boh', film: 'x' });
            const [payload] = profilesToApiPayload([profile]);

            expect(payload.settings.typeSelectors).toEqual({
                film: false,
                serie: false,
                anime: null
            });
        });

        it('sanifica valori numerici o booleani non ammessi per anime', () => {
            const profile = createTestProfile({ film: 1, serie: 'true', anime: true });
            const [payload] = profilesToApiPayload([profile]);

            expect(payload.settings.typeSelectors).toEqual({
                film: false,
                serie: false,
                anime: null
            });
        });

        it('sanifica typeSelectors assente o undefined', () => {
            const profile = createTestProfile(undefined);
            const [payload] = profilesToApiPayload([profile]);

            expect(payload.settings.typeSelectors).toEqual({
                film: false,
                serie: false,
                anime: null
            });
        });

        it('sanifica typeSelectors null o non-oggetto', () => {
            const profile = createTestProfile(null);
            const [payload] = profilesToApiPayload([profile]);

            expect(payload.settings.typeSelectors).toEqual({
                film: false,
                serie: false,
                anime: null
            });
        });
    });

    describe('(c) mapBackendProfile restituisce gli stessi 4 stati (round-trip)', () => {
        const testStates = [
            { film: true, serie: false, anime: null },
            { film: false, serie: true, anime: null },
            { film: false, serie: false, anime: 'only' },
            { film: false, serie: false, anime: 'exclude' }
        ];

        testStates.forEach((expectedState, idx) => {
            it(`Stato ${idx + 1}: round-trip preserva ${JSON.stringify(expectedState)}`, () => {
                const backendProfile = {
                    id: `prof_${idx}`,
                    name: `Profile ${idx}`,
                    catalogs: [],
                    settings: {
                        fastPresetRefresh: false,
                        typeSelectors: expectedState
                    },
                    raw_ui_state: {
                        selectedPresets: [],
                        catalogOrder: []
                    }
                };

                const frontendProfile = mapBackendProfile(backendProfile);
                expect(frontendProfile.settings.typeSelectors).toEqual(expectedState);

                const [apiPayload] = profilesToApiPayload([frontendProfile]);
                expect(apiPayload.settings.typeSelectors).toEqual(expectedState);
            });
        });

        it('mapBackendProfile sanifica valori sporchi da backend', () => {
            const backendProfile = {
                id: 'prof_dirty',
                name: 'Profile Dirty',
                catalogs: [],
                settings: {
                    typeSelectors: { anime: 'boh', film: 'x' }
                }
            };

            const frontendProfile = mapBackendProfile(backendProfile);
            expect(frontendProfile.settings.typeSelectors).toEqual({
                film: false,
                serie: false,
                anime: null
            });
        });

        it('mapBackendProfile gestisce backendProfile privo di settings o typeSelectors', () => {
            const backendProfile = {
                id: 'prof_empty',
                name: 'Profile Empty',
                catalogs: []
            };

            const frontendProfile = mapBackendProfile(backendProfile);
            expect(frontendProfile.settings.typeSelectors).toEqual({
                film: false,
                serie: false,
                anime: null
            });
        });
    });
});
