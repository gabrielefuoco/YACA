const mongoose = require('mongoose');
require('dotenv').config();
const AddonConfig = require('../src/db/models/AddonConfig');

async function run() {
    if (!process.env.MONGODB_URI) {
        console.error("❌ ERRORE: MONGODB_URI non trovata nel file .env");
        process.exit(1);
    }

    try {
        console.log(`🔌 Connessione a MongoDB...`);
        await mongoose.connect(process.env.MONGODB_URI);

        console.log(`\n🔎 Scansione di tutti i profili in AddonConfig...`);
        const allConfigs = await AddonConfig.find({});
        
        let totalDuplicatesRemoved = 0;
        let configsUpdated = 0;

        for (const config of allConfigs) {
            let configChanged = false;

            if (config.profiles && Array.isArray(config.profiles)) {
                config.profiles.forEach(profile => {
                    if (profile.catalogs && Array.isArray(profile.catalogs)) {
                        const seenIds = new Set();
                        const originalLength = profile.catalogs.length;
                        
                        profile.catalogs = profile.catalogs.filter(cat => {
                            if (!cat.id) return true; // keep malformed ones just in case
                            if (seenIds.has(cat.id)) {
                                return false; // Duplicate found!
                            }
                            seenIds.add(cat.id);
                            return true;
                        });

                        const duplicates = originalLength - profile.catalogs.length;
                        if (duplicates > 0) {
                            console.log(`  - 🗑️ Profilo '${profile.name}' (UUID: ${config.uuid}): rimossi ${duplicates} cataloghi duplicati.`);
                            totalDuplicatesRemoved += duplicates;
                            configChanged = true;
                        }
                    }
                });
            }

            if (configChanged) {
                await config.save();
                configsUpdated++;
            }
        }

        console.log(`\n✅ Scansione Completata!`);
        console.log(`=================================================`);
        console.log(`Documenti AddonConfig analizzati : ${allConfigs.length}`);
        console.log(`Documenti AddonConfig aggiornati : ${configsUpdated}`);
        console.log(`Totale cataloghi duplicati rimossi: ${totalDuplicatesRemoved}`);
        console.log(`=================================================`);

    } catch (e) {
        console.error("❌ Errore:", e.message);
    } finally {
        await mongoose.disconnect();
        console.log(`\n👋 Disconnesso da MongoDB.`);
        process.exit(0);
    }
}

run();
