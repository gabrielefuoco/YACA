const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

const TasteProfile = require('../src/models/TasteProfile');
const ProfileScorer = require('../src/profile/ProfileScorer');
const { getPresets } = require('../src/data/presets');
const { executeUniversalPipeline } = require('../src/catalog/providers/AiDiscoveryProvider');
const { createTmdbClient } = require('../src/clients/tmdb');

function printUsage() {
    console.log(`
📊 YACA VSM Profiler
----------------------------------
Calcola l'affinità (Bayesian Score) per un utente specifico contro un catalogo.

Uso:
  node scripts/test_profile_affinity.js <userId> <presetId> [type]

Esempio:
  node scripts/test_profile_affinity.js "gabriele29" "preset_pop_movies" "movie"
`);
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) printUsage();

const userId = args[0];
const presetId = args[1];
const type = args[2] || 'movie';
const tmdbApiKey = process.env.TMDB_API_KEY;

if (!process.env.MONGODB_URI || !tmdbApiKey) {
    console.error("❌ ERRORE: MONGODB_URI o TMDB_API_KEY non trovati in .env");
    process.exit(1);
}

async function run() {
    try {
        console.log(`🔌 Connessione a MongoDB...`);
        await mongoose.connect(process.env.MONGODB_URI);

        console.log(`\n🔎 Cerco profilo per l'utente "${userId}"...`);
        const profileDoc = await TasteProfile.findOne({ owner: userId, context: 'global' });
        
        if (!profileDoc) {
            console.log(`⚠️ Profilo 'global' non trovato per l'utente ${userId}. Verrà calcolato lo score base (senza affinità VSM).`);
        } else {
            console.log(`✅ Profilo trovato! VSM Final DNA estratto.`);
        }

        const presets = getPresets();
        const preset = presets.find(p => p.id === presetId);
        if (!preset) {
            console.error(`❌ ERRORE: Preset "${presetId}" non trovato.`);
            process.exit(1);
        }

        console.log(`\n📥 Fetching catalogo "${preset.name}" (${type})...`);
        const tmdbClient = createTmdbClient(tmdbApiKey);
        
        const results = await executeUniversalPipeline(
            preset,
            tmdbClient,
            tmdbApiKey,
            type,
            0,
            { noFallback: true },
            { noCache: true }
        );

        console.log(`\n📊 Risultati Affinità (Top 20):`);
        console.log(`========================================================================`);
        
        results.forEach((item, index) => {
            const raw = item.rawTMDB || item;
            
            // 1. Light Score
            const lightScore = ProfileScorer.calculateLightScore(raw, profileDoc);
            
            // 2. Full Match Score
            const fullMatch = profileDoc ? ProfileScorer.calculateItemMatch(raw, profileDoc) : 0;
            
            const title = (raw.title || raw.name || "Unknown").substring(0, 35).padEnd(35);
            console.log(`  ${(index+1).toString().padStart(2)}. \x1b[36m${title}\x1b[0m | VSM: \x1b[32m${fullMatch.toFixed(2)}\x1b[0m | Light: \x1b[33m${lightScore.toFixed(2)}\x1b[0m`);
        });
        console.log(`========================================================================`);

    } catch (e) {
        console.error("❌ Errore:", e.message);
    } finally {
        await mongoose.disconnect();
        console.log(`\n👋 Disconnesso da MongoDB.`);
        process.exit(0);
    }
}

run();
