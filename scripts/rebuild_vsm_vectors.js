const mongoose = require('mongoose');
require('dotenv').config();
const TasteProfile = require('../src/models/TasteProfile');
const WatchHistory = require('../src/models/WatchHistory');
const TmdbScoringData = require('../src/models/TmdbScoringData');
const { extractActiveDNAFromTmdbData, computeFinalDNA } = require('../src/utils/dnaExtractor');

function printUsage() {
    console.log(`
🧬 YACA VSM Vector Rebuilder
----------------------------------
Ricalcola i vettori V_active e V_final per uno o tutti gli utenti.

Uso:
  node scripts/rebuild_vsm_vectors.js [userId]

Esempi:
  node scripts/rebuild_vsm_vectors.js "gabriele29"   # Ricalcola solo per gabriele29
  node scripts/rebuild_vsm_vectors.js "all"          # Ricalcola per TUTTI gli utenti
`);
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 1) printUsage();

const targetUserId = args[0];

if (!process.env.MONGODB_URI) {
    console.error("❌ ERRORE: MONGODB_URI non trovata nel file .env");
    process.exit(1);
}

async function rebuildProfile(profile) {
    console.log(`\n🔄 Ricostruzione vettori per utente: ${profile.owner} (Context: ${profile.context})`);
    
    // 1. Azzera V_active corrente
    let vActive = {};
    const vStatic = profile.compiledVectors?.V_static || {};

    // 2. Fetch tutta la WatchHistory dell'utente
    const history = await WatchHistory.find({ owner: profile.owner, context: profile.context });
    console.log(`   - Trovati ${history.length} elementi nello storico.`);

    if (history.length > 0) {
        const tmdbQueries = history.map(h => ({ tmdbId: h.tmdbId, type: h.type }));
        const chunkSize = 500;
        let tmdbDataList = [];
        
        for (let i = 0; i < tmdbQueries.length; i += chunkSize) {
            const chunk = tmdbQueries.slice(i, i + chunkSize);
            const chunkData = await TmdbScoringData.find({ $or: chunk }).lean();
            tmdbDataList = tmdbDataList.concat(chunkData);
        }

        console.log(`   - Trovati ${tmdbDataList.length} elementi TMDB in cache. Estrazione DNA in corso...`);
        
        for (const tmdbData of tmdbDataList) {
            const itemDNA = extractActiveDNAFromTmdbData(tmdbData, 100);
            for (const [key, value] of Object.entries(itemDNA)) {
                vActive[key] = (vActive[key] || 0) + value;
            }
        }
    }

    const totalInteractions = history.length;
    const vFinal = computeFinalDNA(vStatic, vActive, totalInteractions);

    await TasteProfile.updateOne(
        { _id: profile._id },
        { 
            $set: { 
                "compiledVectors.V_active": vActive,
                "compiledVectors.V_final": vFinal
            } 
        }
    );
    console.log(`   ✅ Ricostruzione completata (Interazioni Totali: ${totalInteractions}).`);
}

async function run() {
    try {
        console.log(`🔌 Connessione a MongoDB...`);
        await mongoose.connect(process.env.MONGODB_URI);

        let profilesToRebuild = [];
        if (targetUserId.toLowerCase() === 'all') {
            console.log(`\n⚠️ ATTENZIONE: Verranno ricalcolati I VETTORI PER TUTTI I TASTEPROFILES!`);
            profilesToRebuild = await TasteProfile.find({});
        } else {
            profilesToRebuild = await TasteProfile.find({ owner: targetUserId });
            if (profilesToRebuild.length === 0) {
                console.log(`⚠️ Nessun TasteProfile trovato per l'utente ${targetUserId}`);
                process.exit(1);
            }
        }

        console.log(`\nInizio rebuild di ${profilesToRebuild.length} TasteProfiles...`);
        
        let successCount = 0;
        for (const profile of profilesToRebuild) {
            try {
                await rebuildProfile(profile);
                successCount++;
            } catch (err) {
                console.error(`   ❌ Errore rebuild per ${profile.owner}:`, err.message);
            }
        }

        console.log(`\n🎉 Operazione completata: ${successCount}/${profilesToRebuild.length} profili ricalcolati con successo.`);

    } catch (e) {
        console.error("❌ Errore Fatale:", e.message);
    } finally {
        await mongoose.disconnect();
        console.log(`👋 Disconnesso da MongoDB.`);
        process.exit(0);
    }
}

run();
