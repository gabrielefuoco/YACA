#!/usr/bin/env node
/**
 * scripts/migrate_profile_ui_state.js
 *
 * Migrazione una-tantum per spostare l'intero raw_ui_state al modulo profilo (Ticket 26, Decisione 2):
 * da: `AddonConfig.profiles.$.raw_ui_state` (`selectedPresets`, `catalogOrder`, `newPrompts`, `heroPresetsInitialized`)
 * a:  `ProfileUiState` (`{ addonUuid, profileId, selectedPresets, catalogOrder, newPrompts, heroPresetsInitialized }`).
 *
 * Pattern libraryOrder:
 * Scrive il nuovo posto, il modulo profilo mantiene il fallback di lettura sul vecchio posto
 * finché i dati non sono migrati.
 *
 * SICUREZZA:
 * - Di DEFAULT viene eseguito in modalità DRY-RUN (nessuna scrittura).
 * - Per applicare le modifiche su DB è necessario passare il flag esplicito:
 *     node scripts/migrate_profile_ui_state.js --apply
 * - Opzionale: filtrare per un singolo addonUuid:
 *     node scripts/migrate_profile_ui_state.js --uuid=<addonUuid>
 */

const path = require('path');
const fs = require('fs');

const envPath = fs.existsSync(path.resolve(__dirname, '../.env'))
    ? path.resolve(__dirname, '../.env')
    : path.resolve(__dirname, '../../YACA/.env');
require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const { connectMongo } = require('../src/infra/mongoConnect');

async function migrateProfileUiState(options = {}) {
    const isApply = Boolean(options.apply || process.argv.includes('--apply') || process.argv.includes('--execute'));
    const targetUuid = options.uuid || process.argv.find(arg => arg.startsWith('--uuid='))?.split('=')[1] || null;

    console.log('='.repeat(70));
    console.log('[MIGRAZIONE raw_ui_state -> ProfileUiState (Ticket 26, Decisione 2)]');
    console.log(`MODALITÀ: ${isApply ? '⚠️  APPLICAZIONE REALE SUL DATABASE' : '🔍 DRY-RUN (Nessuna modifica verrà scritta)'}`);
    if (targetUuid) {
        console.log(`FILTRO UUID: ${targetUuid}`);
    }
    console.log('='.repeat(70));

    const AddonConfig = require('../src/models/AddonConfig');
    const ProfileUiState = require('../src/profile/models/ProfileUiState');

    const query = {};
    if (targetUuid) {
        query.uuid = targetUuid;
    }

    const configs = await AddonConfig.find(query).lean();
    console.log(`Trovati ${configs.length} documenti AddonConfig da scansionare.\n`);

    let totalProfilesScanned = 0;
    let profilesWithUiState = 0;
    let recordsMigrated = 0;

    for (const config of configs) {
        const addonUuid = config.uuid;
        if (!addonUuid) continue;

        const profiles = config.profiles || [];
        for (const profile of profiles) {
            totalProfilesScanned++;
            const profileId = profile.id || profile._id?.toString() || 'global';
            const rawUi = profile.raw_ui_state;

            if (!rawUi || typeof rawUi !== 'object') continue;

            const selectedPresets = Array.isArray(rawUi.selectedPresets) ? [...new Set(rawUi.selectedPresets)] : [];
            const catalogOrder = Array.isArray(rawUi.catalogOrder) ? [...new Set(rawUi.catalogOrder)] : [];
            const newPrompts = Array.isArray(rawUi.newPrompts) ? rawUi.newPrompts : [];
            const heroPresetsInitialized = Boolean(rawUi.heroPresetsInitialized);

            const hasData = selectedPresets.length > 0 ||
                            catalogOrder.length > 0 ||
                            newPrompts.length > 0 ||
                            heroPresetsInitialized;

            if (hasData) {
                profilesWithUiState++;
                console.log(`  - [${addonUuid}] Profilo '${profileId}': presets=${selectedPresets.length}, order=${catalogOrder.length}, heroInit=${heroPresetsInitialized}`);

                if (isApply) {
                    await ProfileUiState.updateOne(
                        { addonUuid, profileId },
                        {
                            $set: {
                                selectedPresets,
                                catalogOrder,
                                newPrompts,
                                heroPresetsInitialized
                            }
                        },
                        { upsert: true }
                    );
                    recordsMigrated++;
                }
            }
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('RIASSUNTO MIGRAZIONE UI STATE:');
    console.log(`- Documenti AddonConfig scansionati: ${configs.length}`);
    console.log(`- Profili analizzati:                ${totalProfilesScanned}`);
    console.log(`- Profili con raw_ui_state trovato:  ${profilesWithUiState}`);
    console.log(`- Record scritti in ProfileUiState:  ${isApply ? recordsMigrated : '0 (DRY-RUN)'}`);
    if (!isApply && profilesWithUiState > 0) {
        console.log('\nPer applicare la migrazione, riesegui con: node scripts/migrate_profile_ui_state.js --apply');
    }
    console.log('='.repeat(70));

    return { totalProfilesScanned, profilesWithUiState, recordsMigrated };
}

async function main() {
    let exitCode = 0;
    try {
        // La porta chiede l'URI come primo argomento (dal refactor di src/infra): senza,
        // mongoose solleva "uri must be a string" e la migrazione non parte (trovato il 19/10/2026).
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) throw new Error('MONGODB_URI mancante nelle variabili di ambiente.');
        await connectMongo(mongoUri);
        await migrateProfileUiState();
    } catch (err) {
        console.error('Errore critico durante la migrazione di ProfileUiState:', err);
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
    migrateProfileUiState
};
