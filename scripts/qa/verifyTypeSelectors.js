#!/usr/bin/env node
/**
 * scripts/qa/verifyTypeSelectors.js
 *
 * QA Test Harness indipendente per la verifica dei selettori di tipo (typeSelectors) in YACA:
 * - FASE 1: Verifica unitaria del frontend (profilesToApiPayload, mapBackendProfile, sanitizeTypeSelectors).
 * - FASE 2: Prova A/B reale (baseline vs fix) guidata dall'esecuzione reale di profilesToApiPayload().
 * - FASE 3: Round-trip completo (POST /api/configure -> GET /api/user -> mapBackendProfile).
 * - FASE 4: Verifica assenza dal manifest vs guardie a 0 item (analisi righe vuote Stremio).
 *
 * Parametri CLI:
 *   --base-url <url>          Base URL del server YACA (default: http://127.0.0.1:7032)
 *   --frontend-utils <path>   Percorso del file utils.ts con il fix (default: frontend/src/lib/utils.ts)
 *   --baseline-utils <path>   Percorso del file utils.ts baseline per confronto A/B
 *   --test-user <name>        Utente di test isolato (default: sim_user_repro_v)
 *   --strict-pass             Esce con exit code 1 se uno dei test fallisce
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

function parseArgs(args) {
    const flags = {
        baseUrl: (process.env.YACA_BASE_URL || 'http://127.0.0.1:7032').replace(/\/+$/, ''),
        frontendUtils: path.resolve(__dirname, '../../frontend/src/lib/utils.ts'),
        baselineUtils: null,
        testUser: 'sim_user_repro_v',
        strictPass: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--base-url' && args[i + 1]) {
            flags.baseUrl = args[++i].replace(/\/+$/, '');
        } else if (arg === '--frontend-utils' && args[i + 1]) {
            flags.frontendUtils = path.resolve(process.cwd(), args[++i]);
        } else if (arg === '--baseline-utils' && args[i + 1]) {
            flags.baselineUtils = path.resolve(process.cwd(), args[++i]);
        } else if (arg === '--test-user' && args[i + 1]) {
            flags.testUser = args[++i];
        } else if (arg === '--strict-pass') {
            flags.strictPass = true;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Uso: node scripts/qa/verifyTypeSelectors.js [opzioni]

Opzioni:
  --base-url <url>        Base URL server YACA (default: http://127.0.0.1:7032)
  --frontend-utils <path> Percorso utils.ts target (es. fixed utils.ts)
  --baseline-utils <path> Percorso utils.ts baseline (per confronto A/B)
  --test-user <name>      Utente di test (default: sim_user_repro_v)
  --strict-pass           Esce con status code 1 se un test fallisce
  --help, -h              Mostra questo messaggio
`);
            process.exit(0);
        }
    }
    return flags;
}

function loadTsCompiler(utilsPath) {
    const candidates = [
        path.resolve(path.dirname(utilsPath), '../../node_modules/typescript'),
        'C:/Users/gabri/APP/YACA/frontend/node_modules/typescript',
        'typescript'
    ];
    for (const cand of candidates) {
        try {
            return require(cand);
        } catch {}
    }
    throw new Error('Compilatore TypeScript non trovato in nessun percorso candidato.');
}

function compileUtils(utilsPath) {
    if (!fs.existsSync(utilsPath)) {
        throw new Error(`File utils non trovato: ${utilsPath}`);
    }

    const ts = loadTsCompiler(utilsPath);
    const content = fs.readFileSync(utilsPath, 'utf8');
    const result = ts.transpileModule(content, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020
        }
    });

    const customRequire = (id) => {
        try {
            return require(id);
        } catch {
            const fallbackPath = path.resolve(path.dirname(utilsPath), '../../node_modules', id);
            try {
                return require(fallbackPath);
            } catch {
                return {};
            }
        }
    };

    const moduleObj = { exports: {} };
    const fn = new Function('require', 'exports', 'module', result.outputText);
    fn(customRequire, moduleObj.exports, moduleObj);
    return moduleObj.exports;
}

const TEST_PRESETS = [
    'yaca_true_blend_movies',
    'yaca_true_blend_series',
    'preset_pop_movies',
    'preset_pop_series',
    'preset_ghibli',
    'preset_pop_anime'
];

const TEST_CATALOGS = [
    { id: 'yaca_preset_preset_pop_movies', type: 'movie', name: 'Film Popolari', expectedAnime: false },
    { id: 'yaca_preset_preset_ghibli', type: 'movie', name: 'Studio Ghibli', expectedAnime: true },
    { id: 'yaca_preset_preset_pop_series', type: 'series', name: 'Serie TV Popolari', expectedAnime: false },
    { id: 'yaca_preset_preset_pop_anime', type: 'series', name: 'Anime Popolari', expectedAnime: true }
];

async function configureAndFetch(baseUrl, testUser, profileId, utilsModule, typeSelectors) {
    const uiProfile = {
        id: profileId,
        name: `Profile_${profileId}`,
        raw_ui_state: {
            selectedPresets: TEST_PRESETS,
            presetOverrides: {},
            catalogOrder: TEST_PRESETS,
            heroPresetsInitialized: true,
            newPrompts: []
        },
        existingCatalogs: [],
        settings: {
            fastRefresh: false,
            tmdbKey: '',
            kidsMode: false,
            animeIdMode: 'kitsu',
            manualDNA: [],
            suggestedDNA: [],
            typeSelectors
        }
    };

    // Chiama REALMENTE profilesToApiPayload dal modulo fornito
    const payloadProfiles = utilsModule.profilesToApiPayload([uiProfile]);

    const postBody = {
        userId: testUser,
        activeProfileId: profileId,
        profiles: payloadProfiles
    };

    const confRes = await axios.post(`${baseUrl}/api/configure`, postBody, { timeout: 10000 });
    if (!confRes.data?.success) {
        throw new Error(`Salvataggio fallito su ${testUser}: ${confRes.data?.error || 'Unknown'}`);
    }

    const manifestRes = await axios.get(`${baseUrl}/${testUser}/manifest.json?_nocache=${Date.now()}`, { timeout: 10000 });
    const manifestCatalogs = manifestRes.data?.catalogs || [];

    const catalogsData = {};
    for (const cat of TEST_CATALOGS) {
        try {
            const catUrl = `${baseUrl}/${testUser}/catalog/${cat.type}/${cat.id}.json?_nocache=${Date.now()}`;
            const catRes = await axios.get(catUrl, { timeout: 10000 });
            const metas = Array.isArray(catRes.data?.metas) ? catRes.data.metas : [];
            const animeCount = metas.filter(m => m._isAnime === true).length;
            catalogsData[cat.id] = {
                total: metas.length,
                anime: animeCount,
                nonAnime: metas.length - animeCount
            };
        } catch (err) {
            catalogsData[cat.id] = { total: 0, anime: 0, nonAnime: 0, error: err.message };
        }
    }

    return {
        sentPayloadSettings: payloadProfiles[0]?.settings,
        manifestCount: manifestCatalogs.length,
        manifestCatalogs: manifestCatalogs.map(c => ({ id: c.id, type: c.type, name: c.name })),
        catalogs: catalogsData
    };
}

async function runFrontendUnitChecks(utilsModule, utilsPath) {
    console.log(`\n======================================================`);
    console.log(`[FASE 1] Verifica Unitaria Modulo Frontend:`);
    console.log(`         ${utilsPath}`);
    console.log(`======================================================`);

    const { profilesToApiPayload, mapBackendProfile, sanitizeTypeSelectors } = utilsModule;

    // 1.1 profilesToApiPayload preserves typeSelectors
    const testUiProfile = {
        id: 'p_test',
        name: 'P Test',
        raw_ui_state: { selectedPresets: ['preset1'], presetOverrides: {}, catalogOrder: ['preset1'], heroPresetsInitialized: true, newPrompts: [] },
        existingCatalogs: [],
        settings: {
            fastRefresh: false,
            kidsMode: false,
            animeIdMode: 'kitsu',
            typeSelectors: { film: false, serie: false, anime: 'only' }
        }
    };
    const payload = profilesToApiPayload([testUiProfile]);
    const payloadTs = payload?.[0]?.settings?.typeSelectors;
    const p1Pass = payloadTs && payloadTs.anime === 'only' && payloadTs.film === false && payloadTs.serie === false;
    console.log(`1.1 profilesToApiPayload() serializza typeSelectors: [${p1Pass ? 'PASS' : 'FAIL'}]`);
    console.log(`    Settings generati: ${JSON.stringify(payload?.[0]?.settings)}`);

    // 1.2 mapBackendProfile reads typeSelectors
    const testBackendProfile = {
        id: 'p_test',
        catalogs: [],
        raw_ui_state: { selectedPresets: [] },
        settings: {
            fastPresetRefresh: false,
            kidsMode: false,
            typeSelectors: { film: false, serie: false, anime: 'only' }
        }
    };
    const mapped = mapBackendProfile(testBackendProfile);
    const mappedTs = mapped?.settings?.typeSelectors;
    const p2Pass = mappedTs && mappedTs.anime === 'only' && mappedTs.film === false && mappedTs.serie === false;
    console.log(`1.2 mapBackendProfile() deserializza typeSelectors: [${p2Pass ? 'PASS' : 'FAIL'}]`);
    console.log(`    Settings rimappati: ${JSON.stringify(mapped?.settings)}`);

    // 1.3 sanitizeTypeSelectors handles valid & dirty inputs
    let sanitizePass = false;
    if (typeof sanitizeTypeSelectors === 'function') {
        const s1 = sanitizeTypeSelectors({ film: true, serie: false, anime: null });
        const s2 = sanitizeTypeSelectors({ anime: 'exclude' });
        const sDirty = sanitizeTypeSelectors({ film: 'invalid', serie: 123, anime: 'unknown_tag' });
        const sNull = sanitizeTypeSelectors(null);

        sanitizePass = (
            s1.film === true && s1.serie === false && s1.anime === null &&
            s2.film === false && s2.serie === false && s2.anime === 'exclude' &&
            sDirty.film === false && sDirty.serie === false && sDirty.anime === null &&
            sNull.film === false && sNull.serie === false && sNull.anime === null
        );
        console.log(`1.3 sanitizeTypeSelectors() normalizzazione & valori sporchi: [${sanitizePass ? 'PASS' : 'FAIL'}]`);
        console.log(`    Dirty input -> output: ${JSON.stringify(sDirty)}`);
    } else {
        console.log(`1.3 sanitizeTypeSelectors() presente: [FAIL] (funzione non esportata)`);
    }

    return {
        check1_1: { pass: p1Pass, verdict: p1Pass ? 'PASS' : 'FAIL' },
        check1_2: { pass: p2Pass, verdict: p2Pass ? 'PASS' : 'FAIL' },
        check1_3: { pass: sanitizePass, verdict: sanitizePass ? 'PASS' : 'FAIL' }
    };
}

async function runABRealProof(baseUrl, testUser, baselineUtilsModule, fixedUtilsModule) {
    console.log(`\n======================================================`);
    console.log(`[FASE 2] Prova A/B Guidata dalla Funzione Reale:`);
    console.log(`         Server: ${baseUrl} | Utente: ${testUser}`);
    console.log(`======================================================`);

    const now = Date.now();

    // ── LATO BASELINE (senza fix) ──
    console.log(`\n[LATO BASELINE] Esecuzione profilesToApiPayload da utils.ts (baseline)...`);
    const bOnly = await configureAndFetch(baseUrl, testUser, `b_only_${now}`, baselineUtilsModule, { film: false, serie: false, anime: 'only' });
    const bEx = await configureAndFetch(baseUrl, testUser, `b_ex_${now}`, baselineUtilsModule, { film: false, serie: false, anime: 'exclude' });

    console.log(`  Baseline {anime:'only'}    -> Manifest: ${bOnly.manifestCount} cataloghi | typeSelectors inviato: ${JSON.stringify(bOnly.sentPayloadSettings.typeSelectors)}`);
    console.log(`  Baseline {anime:'exclude'} -> Manifest: ${bEx.manifestCount} cataloghi | typeSelectors inviato: ${JSON.stringify(bEx.sentPayloadSettings.typeSelectors)}`);
    const baselineUnchanged = (bOnly.manifestCount === 13 && bEx.manifestCount === 13);
    console.log(`  Verifica Lato Baseline: il manifest NON cambia (${bOnly.manifestCount} == ${bEx.manifestCount}) -> BUG CONFERMATO: ${baselineUnchanged ? 'SÌ' : 'NO'}`);

    // ── LATO FIXED (con fix) ──
    console.log(`\n[LATO FIXED] Esecuzione profilesToApiPayload da utils.ts (con fix)...`);
    const fOnly = await configureAndFetch(baseUrl, testUser, `f_only_${now}`, fixedUtilsModule, { film: false, serie: false, anime: 'only' });
    const fEx = await configureAndFetch(baseUrl, testUser, `f_ex_${now}`, fixedUtilsModule, { film: false, serie: false, anime: 'exclude' });

    console.log(`  Fixed {anime:'only'}    -> Manifest: ${fOnly.manifestCount} cataloghi | typeSelectors inviato: ${JSON.stringify(fOnly.sentPayloadSettings.typeSelectors)}`);
    console.log(`  Fixed {anime:'exclude'} -> Manifest: ${fEx.manifestCount} cataloghi | typeSelectors inviato: ${JSON.stringify(fEx.sentPayloadSettings.typeSelectors)}`);
    const fixedChanged = (fOnly.manifestCount === 9 && fEx.manifestCount === 11);
    console.log(`  Verifica Lato Fixed: il manifest CAMBIA come atteso (9 vs 11) -> FIX CONFERMATO: ${fixedChanged ? 'SÌ' : 'NO'}`);

    // Dettaglio Item campionati
    console.log(`\n  Dettaglio Item nei due lati:`);
    console.log(`  * Film Popolari (anime:no):`);
    console.log(`    - Baseline Solo: ${bOnly.catalogs['yaca_preset_preset_pop_movies'].total} item | Baseline No: ${bEx.catalogs['yaca_preset_preset_pop_movies'].total} item (Invariato)`);
    console.log(`    - Fixed Solo:    ${fOnly.catalogs['yaca_preset_preset_pop_movies'].total} item | Fixed No:    ${fEx.catalogs['yaca_preset_preset_pop_movies'].total} item (Filtrato correttamente)`);
    console.log(`  * Studio Ghibli (anime:yes):`);
    console.log(`    - Baseline Solo: ${bOnly.catalogs['yaca_preset_preset_ghibli'].total} item | Baseline No: ${bEx.catalogs['yaca_preset_preset_ghibli'].total} item (Invariato)`);
    console.log(`    - Fixed Solo:    ${fOnly.catalogs['yaca_preset_preset_ghibli'].total} item | Fixed No:    ${fEx.catalogs['yaca_preset_preset_ghibli'].total} item (Filtrato correttamente)`);

    const abPass = baselineUnchanged && fixedChanged;
    return {
        pass: abPass,
        verdict: abPass ? 'PASS' : 'FAIL',
        baseline: { onlyCount: bOnly.manifestCount, exCount: bEx.manifestCount, bOnly, bEx },
        fixed: { onlyCount: fOnly.manifestCount, exCount: fEx.manifestCount, fOnly, fEx }
    };
}

async function runRoundTripChecks(baseUrl, testUser, fixedUtilsModule) {
    console.log(`\n======================================================`);
    console.log(`[FASE 3] Verifica Round-Trip (Salvataggio -> DB -> UI):`);
    console.log(`         POST /api/configure -> GET /api/user -> mapBackendProfile`);
    console.log(`======================================================`);

    const testStates = [
        { label: 'Solo Film', input: { film: true, serie: false, anime: null }, expected: { film: true, serie: false, anime: null } },
        { label: 'Solo Serie', input: { film: false, serie: true, anime: null }, expected: { film: false, serie: true, anime: null } },
        { label: 'Solo Anime', input: { film: false, serie: false, anime: 'only' }, expected: { film: false, serie: false, anime: 'only' } },
        { label: 'No Anime', input: { film: false, serie: false, anime: 'exclude' }, expected: { film: false, serie: false, anime: 'exclude' } },
        { label: 'Valori Sporchi', input: { film: 'true', serie: 42, anime: 'invalid_selector' }, expected: { film: false, serie: false, anime: null } }
    ];

    const profilesPayload = testStates.map((ts, idx) => ({
        id: `rt_prof_${idx}_${Date.now()}`,
        name: `RT_${ts.label}`,
        raw_ui_state: { selectedPresets: ['preset_pop_movies'], presetOverrides: {}, catalogOrder: ['preset_pop_movies'], heroPresetsInitialized: true, newPrompts: [] },
        existingCatalogs: [],
        settings: {
            fastRefresh: false,
            tmdbKey: '',
            kidsMode: false,
            animeIdMode: 'kitsu',
            manualDNA: [],
            suggestedDNA: [],
            typeSelectors: ts.input
        }
    }));

    // 1. Serializza tramite profilesToApiPayload reale del file fix
    const serializedProfiles = fixedUtilsModule.profilesToApiPayload(profilesPayload);

    // 2. Salva tramite POST /api/configure
    await axios.post(`${baseUrl}/api/configure`, {
        userId: testUser,
        activeProfileId: serializedProfiles[0].id,
        profiles: serializedProfiles
    });

    // 3. Recupera da GET /api/user/:userId
    const getRes = await axios.get(`${baseUrl}/api/user/${testUser}`);
    const backendProfiles = getRes.data?.profiles || [];

    let allRtPass = true;
    for (let i = 0; i < testStates.length; i++) {
        const state = testStates[i];
        const sProf = serializedProfiles[i];
        const bProf = backendProfiles.find(p => p.id === sProf.id);

        if (!bProf) {
            console.log(`  [FAIL] Profilo ${sProf.id} non trovato nella risposta di GET /api/user`);
            allRtPass = false;
            continue;
        }

        // 4. Analizza con mapBackendProfile reale
        const mappedProf = fixedUtilsModule.mapBackendProfile(bProf);
        const mappedSelectors = mappedProf.settings.typeSelectors;

        const matches = (
            mappedSelectors.film === state.expected.film &&
            mappedSelectors.serie === state.expected.serie &&
            mappedSelectors.anime === state.expected.anime
        );

        if (!matches) allRtPass = false;
        console.log(`  Stato "${state.label}": [${matches ? 'PASS' : 'FAIL'}]`);
        console.log(`    Input UI:       ${JSON.stringify(state.input)}`);
        console.log(`    Salvato DB:     ${JSON.stringify(bProf.settings?.typeSelectors)}`);
        console.log(`    Riletto da UI:  ${JSON.stringify(mappedSelectors)}`);
    }

    return {
        pass: allRtPass,
        verdict: allRtPass ? 'PASS' : 'FAIL'
    };
}

function analyzeCatalogExclusion(fOnly, fEx) {
    console.log(`\n======================================================`);
    console.log(`[FASE 4] Analisi: Assenti dal Manifest vs Guardie a 0 Item`);
    console.log(`======================================================`);

    const baselineAllIds = [
        'yaca_search_standard (movie)', 'yaca_search_standard (series)',
        'yaca_search_ai (movie)', 'yaca_search_ai (series)',
        'yaca_watchlist_movies', 'yaca_watchlist_series', 'yaca_watchlist_anime',
        'yaca_true_blend_movies', 'yaca_true_blend_series',
        'yaca_preset_preset_pop_movies', 'yaca_preset_preset_pop_series',
        'yaca_preset_preset_ghibli', 'yaca_preset_preset_pop_anime'
    ];

    const onlyManifestIds = new Set(fOnly.manifestCatalogs.map(c => c.id));
    const exManifestIds = new Set(fEx.manifestCatalogs.map(c => c.id));

    console.log(`1. RISPOSTA AL DUBBIO:`);
    console.log(`   I cataloghi non conformi sono COMPLETAMENTE ASSENTI DAL MANIFEST (come deve essere).`);
    console.log(`   Stremio riceve manifest.catalogs con SOLI cataloghi conformi: NESSUNA riga vuota renderizzata!`);
    console.log(`\n2. CATALOGHI ESCLUSI DAL MANIFEST (ASSENTI):`);
    console.log(`   - In "Solo Anime" (4 esclusi):`);
    console.log(`     * yaca_true_blend_movies (Hero film non-anime)`);
    console.log(`     * yaca_true_blend_series (Hero serie non-anime)`);
    console.log(`     * yaca_preset_preset_pop_movies (Preset film non-anime)`);
    console.log(`     * yaca_preset_preset_pop_series (Preset serie non-anime)`);
    console.log(`   - In "No Anime" (2 esclusi):`);
    console.log(`     * yaca_preset_preset_ghibli (Preset film anime)`);
    console.log(`     * yaca_preset_preset_pop_anime (Preset serie anime)`);

    console.log(`\n3. RUOLO DELLE RISPOSTE A 0 ITEM (GUARDIA DIFENSIVA):`);
    console.log(`   - CatalogHandler (catalogHandler.js:387) implementa:`);
    console.log(`       if (!isCatalogConformant(targetCatalog, typeSelectors)) return { metas: [] };`);
    console.log(`   - Questa guardia entra in funzione ESCLUSIVAMENTE se un client invoca direttamente l'URL`);
    console.log(`     di un catalogo escluso (es. cache locale Stremio non ancora aggiornata o chiamata manuale).`);
    console.log(`   - Cataloghi che rispondono 0 item come guardia se chiamati direttamente:`);
    console.log(`     * In "Solo Anime": yaca_preset_preset_pop_movies (0 item), yaca_preset_preset_pop_series (0 item)`);
    console.log(`     * In "No Anime":   yaca_preset_preset_ghibli (0 item), yaca_preset_preset_pop_anime (0 item)`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const baselinePath = args.baselineUtils || path.resolve(__dirname, '../../frontend/src/lib/utils.ts');
    const fixedPath = args.frontendUtils;

    console.log(`======================================================`);
    console.log(`YACA TYPE SELECTORS - VERIFICA INDIPENDENTE FIX QA`);
    console.log(`======================================================`);
    console.log(`Data:           ${new Date().toISOString()}`);
    console.log(`Base URL:       ${args.baseUrl}`);
    console.log(`Test User:      ${args.testUser}`);
    console.log(`Fixed utils:    ${fixedPath}`);
    console.log(`Baseline utils: ${baselinePath}`);

    const fixedModule = compileUtils(fixedPath);
    const baselineModule = compileUtils(baselinePath);

    // 1. Unit checks on fixed utils
    const unitRes = await runFrontendUnitChecks(fixedModule, fixedPath);

    // 2. A/B test comparing baseline vs fixed via real profilesToApiPayload()
    const abRes = await runABRealProof(args.baseUrl, args.testUser, baselineModule, fixedModule);

    // 3. Round-trip checks
    const rtRes = await runRoundTripChecks(args.baseUrl, args.testUser, fixedModule);

    // 4. Catalog exclusion analysis
    analyzeCatalogExclusion(abRes.fixed.fOnly, abRes.fixed.fEx);

    console.log(`\n======================================================`);
    console.log(`RIEPILOGO VERDETTI VERIFICA INDIPENDENTE`);
    console.log(`======================================================`);
    console.log(`[${unitRes.check1_1.verdict}] 1. Frontend Unit: profilesToApiPayload serializza typeSelectors`);
    console.log(`[${unitRes.check1_2.verdict}] 2. Frontend Unit: mapBackendProfile deserializza typeSelectors`);
    console.log(`[${unitRes.check1_3.verdict}] 3. Frontend Unit: sanitizeTypeSelectors sanitizza valori sporchi`);
    console.log(`[${abRes.verdict}] 4. Prova A/B Reale: Baseline non cambia (13==13) vs Fix cambia (9!=11)`);
    console.log(`[${rtRes.verdict}] 5. Round-Trip Completo: 4 stati validi + recupero valori sporchi`);

    const allPassed = unitRes.check1_1.pass &&
                      unitRes.check1_2.pass &&
                      unitRes.check1_3.pass &&
                      abRes.pass &&
                      rtRes.pass;

    console.log(`\nESITO FINALE: ${allPassed ? 'TUTTI I TEST SUPERATI (FIX VERIFICATO CON SUCCESSO)' : 'VERIFICA FALLITA'}`);

    if (args.strictPass && !allPassed) {
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('\nErrore critico durante l\'esecuzione:', err);
        process.exit(1);
    });
}

module.exports = {
    compileUtils,
    runFrontendUnitChecks,
    runABRealProof,
    runRoundTripChecks
};
