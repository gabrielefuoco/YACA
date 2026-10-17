#!/usr/bin/env node
/**
 * scripts/migrate_library_order.js
 *
 * Migrazione una-tantum per spostare l'ordine manuale della libreria (Ticket 21):
 * da: `AddonConfig.profiles.$.raw_ui_state.libraryOrder`
 * a:  `UserLibraryOrder` (`{ addonUuid, profileId, itemIds }`) nel dominio libreria.
 *
 * SICUREZZA:
 * - Di DEFAULT viene eseguito in modalità DRY-RUN (nessuna scrittura).
 * - Per applicare le modifiche su DB è necessario passare il flag esplicito:
 *     node scripts/migrate_library_order.js --apply
 *   oppure:
 *     node scripts/migrate_library_order.js --execute
 * - Opzionale: filtrare per un singolo addonUuid:
 *     node scripts/migrate_library_order.js --uuid=<addonUuid>
 *
 * ESECUZIONE SUL MATE (PRODUZIONE):
 *   docker exec yaca-app node scripts/migrate_library_order.js --apply
 */

const path = require('path');
const fs = require('fs');

const envPath = fs.existsSync(path.resolve(__dirname, '../.env'))
    ? path.resolve(__dirname, '../.env')
    : path.resolve(__dirname, '../../YACA/.env');
require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const { connectMongo } = require('../src/utils/mongoConnect');

async function migrateLibraryOrder(options = {}) {
    const isApply = Boolean(options.apply || process.argv.includes('--apply') || process.argv.includes('--execute'));
    const targetUuid = options.uuid || process.argv.find(arg => arg.startsWith('--uuid='))?.split('=')[1] || null;

    console.log('='.repeat(70));
    console.log(`[MIGRAZIONE libraryOrder -> UserLibraryOrder (Ticket 21)]`);
    console.log(`MODALITÀ: ${isApply ? '⚠️  APPLICAZIONE REALE SUL DATABASE' : '🔍 DRY-RUN (Nessuna modifica verrà scritta)'}`);
    if (targetUuid) {
        console.log(`FILTRO UUID: ${targetUuid}`);
    }
    console.log('='.repeat(70));

    const AddonConfig = require('../src/db/models/AddonConfig');
    const UserLibraryOrder = require('../src/library/models/UserLibraryOrder');

    const query = {};
    if (targetUuid) {
        query.uuid = targetUuid;
    }

    const configs = await AddonConfig.find(query).lean();
    console.log(`Trovati ${configs.length} documenti AddonConfig da scansionare.\n`);

    let totalProfilesScanned = 0;
    let profilesWithOrder = 0;
    let recordsMigrated = 0;

    for (const config of configs) {
        const addonUuid = config.uuid;
        if (!addonUuid) continue;

        const profiles = config.profiles || [];
        for (const profile of profiles) {
            totalProfilesScanned++;
            const profileId = profile.id || profile._id?.toString() || 'global';
            const rawOrder = profile.raw_ui_state?.libraryOrder;

            if (Array.isArray(rawOrder) && rawOrder.length > 0) {
                profilesWithOrder++;
                const cleanOrder = [...new Set(rawOrder.map(String))];

                console.log(`  - [${addonUuid}] Profilo '${profileId}': ${cleanOrder.length} elementi in libraryOrder`);

                if (isApply) {
                    await UserLibraryOrder.updateOne(
                        { addonUuid, profileId },
                        { $set: { itemIds: cleanOrder } },
                        { upsert: true }
                    );
                    recordsMigrated++;
                }
            }
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log(`RIASSUNTO MIGRAZIONE:`);
    console.log(`- Documenti AddonConfig scansionati: ${configs.length}`);
    console.log(`- Profili analizzati:                ${totalProfilesScanned}`);
    console.log(`- Profili con libraryOrder trovato:  ${profilesWithOrder}`);
    console.log(`- Record scritti in UserLibraryOrder:${isApply ? recordsMigrated : '0 (DRY-RUN)'}`);
    if (!isApply && profilesWithOrder > 0) {
        console.log(`\nPer applicare la migrazione, riesegui con: node scripts/migrate_library_order.js --apply`);
    }
    console.log('='.repeat(70));
}

async function main() {
    let exitCode = 0;
    try {
        await connectMongo();
        await migrateLibraryOrder();
    } catch (err) {
        // Una migrazione su dato dell'utente che fallisce NON deve uscire 0 (ticket 27):
        // un exit code 0 dice a chi l'ha lanciata (o a un timer) che è andata bene.
        console.error('Errore critico durante la migrazione:', err);
        exitCode = 1;
    } finally {
        try {
            await mongoose.disconnect();
        } catch (_e) {}
        process.exit(exitCode);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    migrateLibraryOrder
};
