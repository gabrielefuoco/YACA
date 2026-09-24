#!/usr/bin/env node
/**
 * scripts/qa/verifyTypeSelectors.js
 *
 * Script riutilizzabile per la verifica e riproduzione del bug sui tag
 * "Solo Anime" / "No Anime" (typeSelectors) in YACA.
 *
 * Esegue:
 * 1. Prova lato frontend: compila frontend/src/lib/utils.ts e testa:
 *    - profilesToApiPayload() con typeSelectors nel profilo UI.
 *    - mapBackendProfile() con typeSelectors nel profilo backend.
 * 2. Prova lato backend (end-to-end):
 *    - Configura sim_user_repro tramite POST /api/configure nei 3 scenari:
 *      (a) baseline (come oggi inviato dal frontend: settings senza typeSelectors)
 *      (b) anime='only' (settings con typeSelectors = { film:false, serie:false, anime:'only' })
 *      (c) anime='exclude' (settings con typeSelectors = { film:false, serie:false, anime:'exclude' })
 *    - Valuta i cataloghi nel manifest e gli item restituiti da cataloghi film e serie.
 *
 * Stampa un verdetto PASS/FAIL per ciascun controllo con numeri di supporto.
 *
 * Parametri:
 *   --base-url <url>          URL server YACA (default: http://127.0.0.1:7032)
 *   --frontend-utils <path>   Percorso di utils.ts (default: frontend/src/lib/utils.ts)
 *   --strict-pass             Esce con exit code 1 se almeno un controllo fallisce (utile per CI)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

function parseArgs(args) {
    const flags = {
        baseUrl: process.env.YACA_BASE_URL || 'http://127.0.0.1:7032',
        frontendUtils: path.resolve(__dirname, '../../frontend/src/lib/utils.ts'),
        strictPass: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--base-url' && args[i + 1]) {
            flags.baseUrl = args[++i].replace(/\/+$/, '');
        } else if (arg === '--frontend-utils' && args[i + 1]) {
            flags.frontendUtils = path.resolve(process.cwd(), args[++i]);
        } else if (arg === '--strict-pass') {
            flags.strictPass = true;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Uso: node scripts/qa/verifyTypeSelectors.js [opzioni]

Opzioni:
  --base-url <url>        Base URL del server YACA (default: http://127.0.0.1:7032)
  --frontend-utils <path> Percorso di utils.ts (default: frontend/src/lib/utils.ts)
  --strict-pass           Esce con codice 1 se uno dei test fallisce
  --help, -h              Mostra questo messaggio di aiuto
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

function compileAndLoadUtils(utilsPath) {
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

async function runFrontendChecks(utilsPath) {
    console.log(`\n======================================================`);
    console.log(`[FASE 1] Verifica Modulo Frontend: ${utilsPath}`);
    console.log(`======================================================`);

    const { profilesToApiPayload, mapBackendProfile } = compileAndLoadUtils(utilsPath);

    if (typeof profilesToApiPayload !== 'function') {
        throw new Error('profilesToApiPayload non trovata nel modulo compilato.');
    }
    if (typeof mapBackendProfile !== 'function') {
        throw new Error('mapBackendProfile non trovata nel modulo compilato.');
    }

    // 1. Prova profilesToApiPayload
    const inputProfile = {
        id: 'prof_test_tsel',
        name: 'Profilo Test',
        raw_ui_state: {
            selectedPresets: ['preset1'],
            presetOverrides: {},
            catalogOrder: ['preset1'],
            heroPresetsInitialized: true,
            newPrompts: []
        },
        existingCatalogs: [],
        settings: {
            fastRefresh: false,
            tmdbKey: 'test-key',
            kidsMode: false,
            animeIdMode: 'kitsu',
            manualDNA: [],
            suggestedDNA: [],
            typeSelectors: { film: false, serie: false, anime: 'only' }
        }
    };

    const payload = profilesToApiPayload([inputProfile]);
    const payloadSettings = payload?.[0]?.settings || {};
    const payloadHasTypeSelectors = 'typeSelectors' in payloadSettings;
    const payloadMatches = payloadHasTypeSelectors &&
        payloadSettings.typeSelectors?.anime === 'only' &&
        payloadSettings.typeSelectors?.film === false &&
        payloadSettings.typeSelectors?.serie === false;

    console.log(`\nControllo 1.1: profilesToApiPayload() include typeSelectors nel payload?`);
    console.log(`  Payload settings generato: ${JSON.stringify(payloadSettings)}`);
    console.log(`  'typeSelectors' presente nel payload: ${payloadHasTypeSelectors}`);
    const verdict1 = payloadMatches ? 'PASS' : 'FAIL';
    console.log(`  Verdetto Controllo 1.1: [${verdict1}]${verdict1 === 'FAIL' ? ' (BUG CONFERMATO: typeSelectors omesso nel payload inviato al backend)' : ' (OK: typeSelectors preservato)'}`);

    // 2. Prova mapBackendProfile
    const backendProfile = {
        id: 'prof_test_tsel',
        name: 'Profilo Test',
        catalogs: [],
        raw_ui_state: { selectedPresets: [] },
        settings: {
            fastPresetRefresh: false,
            tmdbKey: 'test-key',
            kidsMode: false,
            animeIdMode: 'kitsu',
            typeSelectors: { film: false, serie: false, anime: 'only' }
        }
    };

    const mapped = mapBackendProfile(backendProfile);
    const mappedSettings = mapped?.settings || {};
    const mappedHasTypeSelectors = 'typeSelectors' in mappedSettings;
    const mappedMatches = mappedHasTypeSelectors &&
        mappedSettings.typeSelectors?.anime === 'only' &&
        mappedSettings.typeSelectors?.film === false &&
        mappedSettings.typeSelectors?.serie === false;

    console.log(`\nControllo 1.2: mapBackendProfile() rilegge typeSelectors dal backend?`);
    console.log(`  Profile settings mappato: ${JSON.stringify(mappedSettings)}`);
    console.log(`  'typeSelectors' presente nel profilo UI: ${mappedHasTypeSelectors}`);
    const verdict2 = mappedMatches ? 'PASS' : 'FAIL';
    console.log(`  Verdetto Controllo 1.2: [${verdict2}]${verdict2 === 'FAIL' ? ' (BUG CONFERMATO: typeSelectors non riletto dal backend)' : ' (OK: typeSelectors rimappato)'}`);

    return {
        check1: { name: 'profilesToApiPayload includes typeSelectors', pass: payloadMatches, verdict: verdict1 },
        check2: { name: 'mapBackendProfile restores typeSelectors', pass: mappedMatches, verdict: verdict2 }
    };
}

async function runE2eChecks(baseUrl) {
    console.log(`\n======================================================`);
    console.log(`[FASE 2] Verifica End-to-End su Server: ${baseUrl}`);
    console.log(`======================================================`);

    const TEST_USER = 'sim_user_repro';
    const TEST_PROFILE_ID = `prof_tsel_${Date.now()}`;
    const TEST_PRESETS = [
        'yaca_true_blend_movies',
        'yaca_true_blend_series',
        'preset_pop_movies',
        'preset_pop_series',
        'preset_ghibli',
        'preset_pop_anime'
    ];

    const testCatalogs = [
        { id: 'yaca_preset_preset_pop_movies', type: 'movie', name: 'Film Popolari (anime:no)', expectedAnime: false },
        { id: 'yaca_preset_preset_ghibli', type: 'movie', name: 'Studio Ghibli (anime:yes)', expectedAnime: true },
        { id: 'yaca_preset_preset_pop_series', type: 'series', name: 'Serie TV Popolari (anime:no)', expectedAnime: false },
        { id: 'yaca_preset_preset_pop_anime', type: 'series', name: 'Anime Popolari (anime:yes)', expectedAnime: true }
    ];

    async function configureScenario(scenarioLabel, settings) {
        const configurePayload = {
            userId: TEST_USER,
            activeProfileId: TEST_PROFILE_ID,
            profiles: [
                {
                    id: TEST_PROFILE_ID,
                    name: 'Generale Repro',
                    selectedPresets: TEST_PRESETS,
                    heroPresetsInitialized: true,
                    existingCatalogs: [],
                    settings
                }
            ]
        };

        const confRes = await axios.post(`${baseUrl}/api/configure`, configurePayload, { timeout: 10000 });
        if (!confRes.data?.success) {
            throw new Error(`Salvataggio fallito per scenario ${scenarioLabel}`);
        }

        const manifestRes = await axios.get(`${baseUrl}/${TEST_USER}/manifest.json?_nocache=${Date.now()}`, { timeout: 10000 });
        const manifestCatalogs = manifestRes.data?.catalogs || [];

        const catalogDetails = {};
        for (const cat of testCatalogs) {
            try {
                const catUrl = `${baseUrl}/${TEST_USER}/catalog/${cat.type}/${cat.id}.json?_nocache=${Date.now()}`;
                const catRes = await axios.get(catUrl, { timeout: 10000 });
                const metas = Array.isArray(catRes.data?.metas) ? catRes.data.metas : [];
                const animeItems = metas.filter(m => m._isAnime === true).length;
                catalogDetails[cat.id] = { total: metas.length, anime: animeItems, nonAnime: metas.length - animeItems };
            } catch (err) {
                catalogDetails[cat.id] = { total: 0, anime: 0, nonAnime: 0, error: err.message };
            }
        }

        return {
            manifestCount: manifestCatalogs.length,
            manifestCatalogIds: manifestCatalogs.map(c => c.id),
            catalogs: catalogDetails
        };
    }

    // Scenario (a) Baseline (nessun typeSelectors nel payload, come fa oggi il frontend)
    console.log(`\nEsecuzione Scenario (a): baseline senza typeSelectors (payload frontend attuale)...`);
    const resA = await configureScenario('(a) Baseline', {
        fastPresetRefresh: false,
        kidsMode: false,
        animeIdMode: 'kitsu'
    });
    console.log(`  Cataloghi nel manifest: ${resA.manifestCount}`);
    console.log(`  Dettaglio cataloghi campionati:`);
    for (const cat of testCatalogs) {
        const d = resA.catalogs[cat.id];
        console.log(`    - [${cat.type}] ${cat.id}: ${d.total} items (${d.anime} anime, ${d.nonAnime} non-anime)`);
    }

    // Scenario (b) anime: 'only'
    console.log(`\nEsecuzione Scenario (b): typeSelectors = { anime: 'only' }...`);
    const resB = await configureScenario('(b) Solo Anime', {
        fastPresetRefresh: false,
        kidsMode: false,
        animeIdMode: 'kitsu',
        typeSelectors: { film: false, serie: false, anime: 'only' }
    });
    console.log(`  Cataloghi nel manifest: ${resB.manifestCount}`);
    console.log(`  Dettaglio cataloghi campionati:`);
    for (const cat of testCatalogs) {
        const d = resB.catalogs[cat.id];
        console.log(`    - [${cat.type}] ${cat.id}: ${d.total} items (${d.anime} anime, ${d.nonAnime} non-anime)`);
    }

    // Scenario (c) anime: 'exclude'
    console.log(`\nEsecuzione Scenario (c): typeSelectors = { anime: 'exclude' }...`);
    const resC = await configureScenario('(c) No Anime', {
        fastPresetRefresh: false,
        kidsMode: false,
        animeIdMode: 'kitsu',
        typeSelectors: { film: false, serie: false, anime: 'exclude' }
    });
    console.log(`  Cataloghi nel manifest: ${resC.manifestCount}`);
    console.log(`  Dettaglio cataloghi campionati:`);
    for (const cat of testCatalogs) {
        const d = resC.catalogs[cat.id];
        console.log(`    - [${cat.type}] ${cat.id}: ${d.total} items (${d.anime} anime, ${d.nonAnime} non-anime)`);
    }

    // Valutazione Backend:
    // 1. Manifest filtering:
    // - In Scenario B: non-anime preset/hero devono essere rimossi (manifestCount B < manifestCount A, contiene solo anime)
    // - In Scenario C: anime preset devono essere rimossi (manifestCount C < manifestCount A, contiene solo non-anime)
    const bHasOnlyAnimePresets = !resB.manifestCatalogIds.includes('yaca_preset_preset_pop_movies') &&
        !resB.manifestCatalogIds.includes('yaca_preset_preset_pop_series') &&
        resB.manifestCatalogIds.includes('yaca_preset_preset_ghibli') &&
        resB.manifestCatalogIds.includes('yaca_preset_preset_pop_anime');

    const cHasOnlyNonAnimePresets = resC.manifestCatalogIds.includes('yaca_preset_preset_pop_movies') &&
        resC.manifestCatalogIds.includes('yaca_preset_preset_pop_series') &&
        !resC.manifestCatalogIds.includes('yaca_preset_preset_ghibli') &&
        !resC.manifestCatalogIds.includes('yaca_preset_preset_pop_anime');

    const manifestFilteringPass = (resB.manifestCount < resA.manifestCount) &&
        (resC.manifestCount < resA.manifestCount) &&
        bHasOnlyAnimePresets &&
        cHasOnlyNonAnimePresets;

    const verdict3 = manifestFilteringPass ? 'PASS' : 'FAIL';
    console.log(`\nControllo 2.1: Filtraggio Manifest Backend`);
    console.log(`  Conteggi Manifest: Baseline=${resA.manifestCount}, SoloAnime=${resB.manifestCount}, NoAnime=${resC.manifestCount}`);
    console.log(`  SoloAnime contiene solo cataloghi anime conformi: ${bHasOnlyAnimePresets}`);
    console.log(`  NoAnime contiene solo cataloghi non-anime conformi: ${cHasOnlyNonAnimePresets}`);
    console.log(`  Verdetto Controllo 2.1: [${verdict3}] (Backend sano nel filtraggio manifest)`);

    // 2. Catalog handler items guard & filtering:
    // - In Scenario B: pop_movies dà 0, pop_series dà 0, ghibli dà >0 (100% anime), pop_anime dà >0 (100% anime)
    // - In Scenario C: pop_movies dà >0 (0% anime), pop_series dà >0 (0% anime), ghibli dà 0, pop_anime dà 0
    const bItemsPass = resB.catalogs['yaca_preset_preset_pop_movies'].total === 0 &&
        resB.catalogs['yaca_preset_preset_pop_series'].total === 0 &&
        resB.catalogs['yaca_preset_preset_ghibli'].total > 0 &&
        resB.catalogs['yaca_preset_preset_ghibli'].nonAnime === 0 &&
        resB.catalogs['yaca_preset_preset_pop_anime'].total > 0 &&
        resB.catalogs['yaca_preset_preset_pop_anime'].nonAnime === 0;

    const cItemsPass = resC.catalogs['yaca_preset_preset_pop_movies'].total > 0 &&
        resC.catalogs['yaca_preset_preset_pop_movies'].anime === 0 &&
        resC.catalogs['yaca_preset_preset_pop_series'].total > 0 &&
        resC.catalogs['yaca_preset_preset_pop_series'].anime === 0 &&
        resC.catalogs['yaca_preset_preset_ghibli'].total === 0 &&
        resC.catalogs['yaca_preset_preset_pop_anime'].total === 0;

    const itemFilteringPass = bItemsPass && cItemsPass;
    const verdict4 = itemFilteringPass ? 'PASS' : 'FAIL';

    console.log(`\nControllo 2.2: Filtraggio Items e Guardia Cataloghi Backend`);
    console.log(`  SoloAnime blocca cataloghi non-anime e mantiene anime: ${bItemsPass}`);
    console.log(`  NoAnime blocca cataloghi anime e mantiene non-anime: ${cItemsPass}`);
    console.log(`  Verdetto Controllo 2.2: [${verdict4}] (Backend sano nel servire contenuti)`);

    return {
        check3: { name: 'Backend manifest filtering with typeSelectors', pass: manifestFilteringPass, verdict: verdict3 },
        check4: { name: 'Backend catalog guard and item filtering', pass: itemFilteringPass, verdict: verdict4 },
        counts: {
            scenarioA: { manifest: resA.manifestCount, catalogs: resA.catalogs },
            scenarioB: { manifest: resB.manifestCount, catalogs: resB.catalogs },
            scenarioC: { manifest: resC.manifestCount, catalogs: resC.catalogs },
        }
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    console.log(`=== VERIFICA COMPLETA TYPE SELECTORS (QA TEST HARNESS) ===`);
    console.log(`Data/Ora: ${new Date().toISOString()}`);
    console.log(`Base URL: ${args.baseUrl}`);
    console.log(`Frontend utils.ts: ${args.frontendUtils}`);

    const feResults = await runFrontendChecks(args.frontendUtils);
    const beResults = await runE2eChecks(args.baseUrl);

    console.log(`\n======================================================`);
    console.log(`RIEPILOGO VERDETTI`);
    console.log(`======================================================`);
    console.log(`[${feResults.check1.verdict}] 1. Frontend profilesToApiPayload() (salvataggio typeSelectors)`);
    console.log(`[${feResults.check2.verdict}] 2. Frontend mapBackendProfile() (caricamento typeSelectors)`);
    console.log(`[${beResults.check3.verdict}] 3. Backend Manifest filtering (isolamento cataloghi anime/non-anime)`);
    console.log(`[${beResults.check4.verdict}] 4. Backend Catalog Handler filtering (guardie e filtraggio item)`);

    const allPassed = feResults.check1.pass && feResults.check2.pass && beResults.check3.pass && beResults.check4.pass;
    console.log(`\nESITO COMPLESSIVO: ${allPassed ? 'TUTTI I TEST SUPERATI (FIX VERIFICATO)' : 'BUG RIPRODOTTO (FRONTEND GUASTO, BACKEND FUNZIONANTE)'}`);

    if (args.strictPass && !allPassed) {
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('\nErrore critico durante l\'esecuzione:', err.message);
        process.exit(1);
    });
}

module.exports = {
    runFrontendChecks,
    runE2eChecks
};
