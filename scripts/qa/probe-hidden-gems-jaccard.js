#!/usr/bin/env node
/**
 * scripts/qa/probe-hidden-gems-jaccard.js
 *
 * Sonda riproducibile per la misura del catalogo hidden_gems (Ticket 41).
 * Costruisce le due liste (switch OFF vs switch ON) per Film e Serie,
 * calcola: count OFF, count ON, intersezione, unione, indice Jaccard e statistiche di punteggio.
 *
 * Utilizzo:
 *   node scripts/qa/probe-hidden-gems-jaccard.js [--profileId=<id>] [--userId=<id>]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const duckDbStore = require('../../src/indice');
const {
    HERO_STRATEGIES,
    setFlagNewHiddenGems,
    getRecommendationId
} = require('../../src/pool');
const { fetchProfileContext } = require('../../src/profile');

// DNA di fallback sintetico e realistico (dal profilo cinefilo di QA) nel caso in cui MongoDB non sia raggiungibile
const FALLBACK_TASTE_PROFILE = {
    compiledVectors: {
        V_final: {
            'g:18': 0.85,    // Drama
            'g:878': 0.80,   // Sci-Fi
            'g:53': 0.75,    // Thriller
            'g:9648': 0.70,  // Mystery
            'g:80': 0.65,    // Crime
            'k:9882': 0.60,  // space
            'k:818': 0.60,   // based on novel
            'k:9715': 0.55   // superhero
        }
    }
};

async function getProfileForProbe(userId, context) {
    if (process.env.MONGODB_URI) {
        try {
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
            }
            const { profile } = await fetchProfileContext(userId, context).catch(() => ({}));
            if (profile && profile.compiledVectors?.V_final && Object.keys(profile.compiledVectors.V_final).length > 0) {
                return { profile, source: `MongoDB (${profile.owner || userId}/${profile.context || context})` };
            }
        } catch (_err) {
            // MongoDB non raggiungibile: fallback controllato
        }
    }
    return { profile: FALLBACK_TASTE_PROFILE, source: 'Synthetic Cinefilo Profile (offline QA)' };
}

function extractIds(result) {
    const items = Array.isArray(result) ? result : (result?.ids || []);
    return items.map(item => getRecommendationId(item)).filter(Boolean);
}

function extractScores(result) {
    const items = Array.isArray(result) ? result : (result?.ids || []);
    return items.map(item => {
        if (typeof item === 'object' && item !== null) {
            return Number(item.punteggio ?? ((item.matchScore ?? 0) / 10));
        }
        return 0;
    });
}

function computeJaccard(listA, listB) {
    const setA = new Set(listA);
    const setB = new Set(listB);
    const intersection = [...setA].filter(id => setB.has(id)).length;
    const union = new Set([...setA, ...setB]).size;
    const jaccard = union > 0 ? (intersection / union) : 0;
    return {
        countA: listA.length,
        countB: listB.length,
        intersection,
        union,
        jaccard: Number(jaccard.toFixed(4))
    };
}

async function runProbe() {
    console.log('======================================================================');
    console.log('  YACA QA PROBE — Misura Confronto Hidden Gems (Switch OFF vs ON)     ');
    console.log('======================================================================\n');

    await duckDbStore.init();

    const args = process.argv.slice(2);
    const userIdArg = args.find(a => a.startsWith('--userId='))?.split('=')[1] || 'REOZrGNRr3';
    const profileIdArg = args.find(a => a.startsWith('--profileId='))?.split('=')[1] || 'global';

    const { profile, source } = await getProfileForProbe(userIdArg, profileIdArg);
    console.log(`Profilo di gusto utilizzato: ${source}`);
    console.log(`Dimensioni V_final: ${Object.keys(profile.compiledVectors?.V_final || {}).length} chiavi\n`);

    const strat = HERO_STRATEGIES.find(s => s.slug === 'hidden_gems');
    if (!strat) {
        console.error('ERRORE: Strategia hidden_gems non trovata in HERO_STRATEGIES');
        process.exit(1);
    }

    const report = {};

    for (const mediaType of ['movie', 'series']) {
        console.log(`----------------------------------------------------------------------`);
        console.log(`MEDIA: ${mediaType.toUpperCase()}`);
        console.log(`----------------------------------------------------------------------`);

        const ctx = {
            userId: userIdArg,
            context: profileIdArg,
            mediaType,
            heroCandidateLimit: 160,
            kidsMode: false,
            effectiveSelectors: { anime: 'neutral' },
            tmdbApiKey: null,
            tasteProfile: profile,
            profile: profile
        };

        // 1. Esecuzione con switch OFF (vecchio motore)
        setFlagNewHiddenGems(false);
        const resOff = await strat.run(ctx);
        const idsOff = extractIds(resOff);

        // 2. Esecuzione con switch ON (nuovo candidate provider su DuckDB + VSM)
        setFlagNewHiddenGems(true);
        const resOn = await strat.run(ctx);
        const idsOn = extractIds(resOn);
        const scoresOn = extractScores(resOn);

        // 3. Calcolo metriche
        const jaccardMetrics = computeJaccard(idsOff, idsOn);

        const nonZeroScores = scoresOn.filter(s => s > 0);
        const avgScore = scoresOn.length > 0 ? (scoresOn.reduce((a, b) => a + b, 0) / scoresOn.length) : 0;
        const maxScore = scoresOn.length > 0 ? Math.max(...scoresOn) : 0;
        const minScore = scoresOn.length > 0 ? Math.min(...scoresOn) : 0;

        report[mediaType] = {
            ...jaccardMetrics,
            scoreStats: {
                totalCandidates: scoresOn.length,
                nonZeroCount: nonZeroScores.length,
                avgScore: Number(avgScore.toFixed(2)),
                minScore: Number(minScore.toFixed(2)),
                maxScore: Number(maxScore.toFixed(2))
            }
        };

        console.log(`  OFF Count    : ${jaccardMetrics.countA}`);
        console.log(`  ON Count     : ${jaccardMetrics.countB}`);
        console.log(`  Intersezione : ${jaccardMetrics.intersection}`);
        console.log(`  Unione       : ${jaccardMetrics.union}`);
        console.log(`  Jaccard Index: ${jaccardMetrics.jaccard} (~${(jaccardMetrics.jaccard * 100).toFixed(2)}%)`);
        console.log(`  Score Stats  : min=${minScore.toFixed(2)}, avg=${avgScore.toFixed(2)}, max=${maxScore.toFixed(2)}, non-zero=${nonZeroScores.length}/${scoresOn.length}\n`);
    }

    // Tabella riassuntiva Markdown per Esito
    console.log('======================================================================');
    console.log('  TABELLA RIASSUNTIVA MARKDOWN PER ## Esito                           ');
    console.log('======================================================================');
    console.log('| Media | OFF Count | ON Count | Intersezione | Unione | Indice Jaccard | Score VSM medio |');
    console.log('|---|---|---|---|---|---|---|');
    for (const [m, r] of Object.entries(report)) {
        console.log(`| **${m === 'movie' ? 'Film (movie)' : 'Serie (series)'}** | **${r.countA}** | **${r.countB}** | ${r.intersection} | ${r.union} | **${r.jaccard}** (~${(r.jaccard * 100).toFixed(2)}%) | ${r.scoreStats.avgScore} (max ${r.scoreStats.maxScore}) |`);
    }
    console.log('======================================================================\n');

    // Chiusura risorse
    setFlagNewHiddenGems(null);
    if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
    }
    await duckDbStore.close();

    process.exit(0);
}

runProbe().catch(err => {
    console.error('Errore durante l\'esecuzione della sonda:', err);
    process.exit(1);
});
