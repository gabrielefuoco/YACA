#!/usr/bin/env node
/**
 * Test End-to-End del Mapping Anime
 * 
 * Simula l'intera pipeline: TMDB fetch → Anibridge resolveKitsu → applyKitsuMappingToMeta
 * per anime split-cour noti, verificando che:
 *   1. Tutti gli episodi regolari vengano mappati correttamente a Kitsu
 *   2. Gli episodi fuori range (Ep 0, special) non generino ID Kitsu fasulli
 *   3. Gli split-cour vengano risolti con l'offset corretto
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { fetchTmdbEpisodes, createTmdbClient } = require('../src/clients/tmdb');
const animeMappingStore = require('../src/data/animeMappingStore');
const connectDB = require('../src/db/connection');

// ═══════════════════════════════════════════
// Test Cases — Anime con split-cour noti
// ═══════════════════════════════════════════
const TEST_CASES = [
    {
        name: 'Mushoku Tensei S2',
        tmdbId: '94664',
        season: 2,
        totalSeasons: 2,
        expectedMapping: {
            // Cour 1: TMDB Ep 1-12 → AniList 145064 (Kitsu 45950) Ep 1-12
            // Cour 2: TMDB Ep 13-24 → AniList 166873 (Kitsu 47694) Ep 1-12
            cour1KitsuId: 45950,
            cour2KitsuId: 47694,
            courBoundary: 12,
        }
    },
    {
        name: '86 EIGHTY-SIX',
        tmdbId: '116589',
        season: 1,
        totalSeasons: 1,
        expectedMapping: null
    },
    {
        name: 'Vinland Saga S2',
        tmdbId: '72636',
        season: 2,
        totalSeasons: 2,
        expectedMapping: null
    },
    {
        name: 'One Piece',
        tmdbId: '37854',
        season: 1,
        totalSeasons: 1, // TMDB One Piece is generally considered to have season 1 as the main series
        expectedMapping: null
    },
    {
        name: 'Attack on Titan S4 (The Final Season)',
        tmdbId: '1429',
        season: 4,
        totalSeasons: 4, // Final season has 3 parts/cours
        expectedMapping: null
    },
    {
        name: 'Demon Slayer S2',
        tmdbId: '85937',
        season: 2,
        totalSeasons: 4,
        expectedMapping: null
    },
    {
        name: 'My Hero Academia S2 (Offset Test)',
        tmdbId: '65930',
        season: 2,
        totalSeasons: 7,
        expectedMapping: null
    },
    {
        name: 'Sword Art Online S3 (Alicization multi-cour)',
        tmdbId: '45782',
        season: 3,
        totalSeasons: 3,
        expectedMapping: null
    },
    {
        name: 'FLCL (OVA Short Series)',
        tmdbId: '32168',
        season: 1,
        totalSeasons: 1,
        expectedMapping: null
    }
];

const C = {
    reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
    yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m',
};

function ok(msg) { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function fail(msg) { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function warn(msg) { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function info(msg) { console.log(`  ${C.dim}${msg}${C.reset}`); }
function header(msg) { console.log(`\n${C.bold}${C.cyan}═══ ${msg} ═══${C.reset}`); }

function testAnibridgeMapping(testCase) {
    header(`[Anibridge] ${testCase.name} (TMDB ${testCase.tmdbId} S${testCase.season})`);
    const key = `${testCase.tmdbId}:${testCase.season}`;
    const mappings = animeMappingStore.tmdbToAnimeNode.get(key);
    if (!mappings) { fail(`Nessun mapping Anibridge per chiave "${key}"`); return false; }
    ok(`Trovati ${mappings.length} mapping(s) per "${key}"`);
    let allOk = true;
    for (const m of mappings) {
        const kitsuId = animeMappingStore.fribbIndex[m.bridgeNode.p]?.get(m.bridgeNode.id);
        info(`  → ${m.bridgeNode.p}:${m.bridgeNode.id} → Kitsu ${kitsuId || 'N/A'}`);
        for (const rule of m.rules) {
            info(`    Range TMDB [${rule.start}-${rule.end}] → offset ${rule.offset >= 0 ? '+' : ''}${rule.offset}`);
        }
        if (!kitsuId) { fail(`Nodo ponte non trovato in Fribb!`); allOk = false; }
    }
    return allOk;
}

function testResolveKitsu(testCase, episodes) {
    header(`[resolveKitsu] ${testCase.name} — ${episodes.length} episodi`);
    let mapped = 0, unmapped = 0, errors = [];
    const results = [];
    for (const ep of episodes) {
        const result = animeMappingStore.resolveKitsu(testCase.tmdbId, ep.season, ep.episode);
        results.push({ ep, result });
        if (result.success) { mapped++; } else { unmapped++; errors.push({ ep: ep.episode, season: ep.season, error: result.error }); }
    }
    ok(`${mapped}/${episodes.length} episodi mappati con successo`);
    if (unmapped > 0) {
        warn(`${unmapped} episodi NON mappati:`);
        for (const e of errors) { info(`  Ep S${e.season}E${e.ep}: ${e.error}`); }
    }
    return results;
}

function testSplitCour(testCase, resolveResults) {
    if (!testCase.expectedMapping) return;
    header(`[Split-Cour] ${testCase.name}`);
    const { cour1KitsuId, cour2KitsuId, courBoundary } = testCase.expectedMapping;
    
    const cour1Eps = resolveResults.filter(r => r.ep.episode >= 1 && r.ep.episode <= courBoundary && r.result.success);
    const cour1Wrong = cour1Eps.filter(r => r.result.kitsuId !== cour1KitsuId);
    if (cour1Wrong.length === 0 && cour1Eps.length > 0) {
        ok(`Cour 1 (Ep 1-${courBoundary}): tutti ${cour1Eps.length} ep mappati a Kitsu ${cour1KitsuId}`);
    } else if (cour1Eps.length === 0) {
        fail(`Cour 1: nessun episodio mappato!`);
    } else {
        fail(`Cour 1: ${cour1Wrong.length} episodi con Kitsu ID sbagliato`);
        cour1Wrong.forEach(r => info(`  Ep ${r.ep.episode} → Kitsu ${r.result.kitsuId} (atteso ${cour1KitsuId})`));
    }
    
    const cour2Eps = resolveResults.filter(r => r.ep.episode > courBoundary && r.result.success);
    const cour2Wrong = cour2Eps.filter(r => r.result.kitsuId !== cour2KitsuId);
    if (cour2Wrong.length === 0 && cour2Eps.length > 0) {
        ok(`Cour 2 (Ep ${courBoundary + 1}+): tutti ${cour2Eps.length} ep mappati a Kitsu ${cour2KitsuId}`);
        const firstCour2 = cour2Eps[0];
        if (firstCour2.result.kitsuEpisode === 1) {
            ok(`Offset Cour 2 corretto: TMDB Ep ${firstCour2.ep.episode} → Kitsu Ep 1`);
        } else {
            fail(`Offset Cour 2 SBAGLIATO: TMDB Ep ${firstCour2.ep.episode} → Kitsu Ep ${firstCour2.result.kitsuEpisode} (atteso 1)`);
        }
    } else if (cour2Eps.length === 0) {
        fail(`Cour 2: nessun episodio mappato!`);
    } else {
        fail(`Cour 2: ${cour2Wrong.length} episodi con Kitsu ID sbagliato`);
        cour2Wrong.forEach(r => info(`  Ep ${r.ep.episode} → Kitsu ${r.result.kitsuId} (atteso ${cour2KitsuId})`));
    }
}

function testEpisodeZero(testCase) {
    header(`[Episode 0] ${testCase.name}`);
    const result = animeMappingStore.resolveKitsu(testCase.tmdbId, testCase.season, 0);
    if (result.success) {
        warn(`Ep 0 è MAPPATO: Kitsu ${result.kitsuId}:${result.kitsuEpisode} — potrebbe essere un problema`);
    } else {
        ok(`Ep 0 NON mappato: "${result.error}"`);
        info(`  → Con il fix: Ep 0 mantiene ID TMDB nativo (visibile ma non mappato a Kitsu)`);
    }
}

function testApplyMapping(testCase, episodes) {
    header(`[applyKitsuMapping Simulation] ${testCase.name}`);
    let kitsuMapped = 0, wouldFallback = 0;
    for (const ep of episodes) {
        const mapped = animeMappingStore.resolveKitsu(testCase.tmdbId, ep.season, ep.episode);
        if (mapped && mapped.success) { kitsuMapped++; } else { wouldFallback++; }
    }
    ok(`Kitsu mapping diretto: ${kitsuMapped}/${episodes.length}`);
    if (wouldFallback > 0) {
        warn(`${wouldFallback} ep cadrebbero nel fallback TVDB (ID Kitsu cieco)`);
        info(`  → ATTUALE: ricevono ID Kitsu potenzialmente sbagliato`);
        info(`  → PROPOSTO: mantengono ID TMDB nativo (funziona via IMDb)`);
    }
}

async function main() {
    console.log(`\n${C.bold}╔════════════════════════════════════════════════════════╗`);
    console.log(`║  YACA Anime Mapping — Test End-to-End                  ║`);
    console.log(`╚════════════════════════════════════════════════════════╝${C.reset}\n`);
    
    await connectDB();
    await animeMappingStore.init();
    const tmdbApiKey = process.env.TMDB_API_KEY;
    const client = createTmdbClient(tmdbApiKey);

    for (const testCase of TEST_CASES) {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`${C.bold}Testing: ${testCase.name} (TMDB ${testCase.tmdbId})${C.reset}`);
        console.log(`${'─'.repeat(60)}`);
        
        testAnibridgeMapping(testCase);
        
        header(`[TMDB Fetch] ${testCase.name}`);
        let episodes;
        try {
            episodes = await fetchTmdbEpisodes(client, testCase.tmdbId, testCase.totalSeasons, null, 'ja');
            const seasonEps = episodes.filter(e => e.season === testCase.season);
            ok(`Fetchati ${episodes.length} ep totali, ${seasonEps.length} per S${testCase.season}`);
            const ep0 = seasonEps.find(e => e.episode === 0);
            if (ep0) { warn(`Episodio 0 presente: "${ep0.title}"`); }
            else { info(`Nessun Episodio 0 nella stagione ${testCase.season}`); }
            episodes = seasonEps;
        } catch (err) {
            fail(`TMDB fetch fallito: ${err.message}`);
            continue;
        }
        
        const resolveResults = testResolveKitsu(testCase, episodes);
        testSplitCour(testCase, resolveResults);
        testEpisodeZero(testCase);
        testApplyMapping(testCase, episodes);
    }
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`${C.bold}Test completati.${C.reset}`);
    console.log(`${'═'.repeat(60)}\n`);
    
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error(`\n${C.red}FATAL: ${err.message}${C.reset}`);
    console.error(err.stack);
    process.exit(1);
});
