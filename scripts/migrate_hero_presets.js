#!/usr/bin/env node
/**
 * scripts/migrate_hero_presets.js
 *
 * Migrazione una-tantum per aggiornare i cataloghi hero nei profili (Ticket 47):
 * - Rimuove gli 8 ID hero morti (rimossi dal ticket 46) da selectedPresets e catalogOrder:
 *     yaca_true_blend_movies, yaca_true_blend_series,
 *     yaca_seed_network_movies, yaca_seed_network_series,
 *     yaca_hidden_gems_movies, yaca_hidden_gems_series,
 *     yaca_trakt_filtered_movies, yaca_trakt_filtered_series
 * - Aggiunge gli 8 ID hero vivi mancanti da src/catalog/registry.js:
 *     yaca_mondi_movies, yaca_mondi_series,
 *     yaca_passo_fuori_movies, yaca_passo_fuori_series,
 *     yaca_uscite_nuove_movies, yaca_uscite_nuove_series,
 *     yaca_nicchia_di_qualita_movies, yaca_nicchia_di_qualita_series
 *
 * SICUREZZA:
 * - Di DEFAULT viene eseguito in modalità DRY-RUN (nessuna scrittura).
 * - Per applicare le modifiche su DB è necessario passare il flag esplicito:
 *     node scripts/migrate_hero_presets.js --apply
 *   oppure:
 *     node scripts/migrate_hero_presets.js --execute
 * - Opzionale: filtrare per un singolo addonUuid:
 *     node scripts/migrate_hero_presets.js --uuid=<addonUuid>
 *
 * ESECUZIONE SUL MATE (PRODUZIONE - DOPO IL DEPLOY):
 *   docker exec yaca-app node scripts/migrate_hero_presets.js --apply
 */

const path = require('path');
const fs = require('fs');

const envPath = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../YACA/.env'),
    path.resolve(__dirname, '../../../YACA/.env')
].find(p => fs.existsSync(p));

if (envPath) {
    require('dotenv').config({ path: envPath });
} else {
    require('dotenv').config();
}

const mongoose = require('mongoose');
const { connectMongo } = require('../src/infra/mongoConnect');
const { HERO_IDS } = require('../src/catalog/registry');

const DEAD_HERO_IDS = Object.freeze([
    'yaca_true_blend_movies',
    'yaca_true_blend_series',
    'yaca_seed_network_movies',
    'yaca_seed_network_series',
    'yaca_hidden_gems_movies',
    'yaca_hidden_gems_series',
    'yaca_trakt_filtered_movies',
    'yaca_trakt_filtered_series'
]);

function cleanArray(rawArray = []) {
    const original = Array.isArray(rawArray) ? rawArray : [];
    const removedDead = original.filter(id => DEAD_HERO_IDS.includes(id));
    let cleaned = original.filter(id => !DEAD_HERO_IDS.includes(id));
    const addedLive = [];
    for (const liveId of HERO_IDS) {
        if (!cleaned.includes(liveId)) {
            cleaned.push(liveId);
            addedLive.push(liveId);
        }
    }
    cleaned = [...new Set(cleaned)];
    return {
        cleaned,
        removedDead,
        addedLive,
        changed: removedDead.length > 0 || addedLive.length > 0
    };
}

async function migrateHeroPresets(options = {}) {
    const isApply = Boolean(options.apply || process.argv.includes('--apply') || process.argv.includes('--execute'));
    const targetUuid = options.uuid || process.argv.find(arg => arg.startsWith('--uuid='))?.split('=')[1] || null;

    console.log('='.repeat(70));
    console.log('[MIGRAZIONE PRESET HERO (Ticket 47)]');
    console.log(`MODALITÀ: ${isApply ? '⚠️  APPLICAZIONE REALE SUL DATABASE' : '🔍 DRY-RUN (Nessuna modifica verrà scritta)'}`);
    if (targetUuid) {
        console.log(`FILTRO UUID: ${targetUuid}`);
    }
    console.log('='.repeat(70));

    const AddonConfig = require('../src/models/AddonConfig');
    let ProfileUiState = null;
    try {
        ProfileUiState = require('../src/profile/models/ProfileUiState');
    } catch (_e) {}

    const query = {};
    if (targetUuid) {
        query.uuid = targetUuid;
    }

    const configs = await AddonConfig.find(query).lean();
    console.log(`Trovati ${configs.length} documenti AddonConfig da scansionare.\n`);

    let totalProfilesScanned = 0;
    let profilesModified = 0;
    let recordsUpdated = 0;

    for (const config of configs) {
        const addonUuid = config.uuid;
        if (!addonUuid) continue;

        const profiles = config.profiles || [];
        for (const profile of profiles) {
            totalProfilesScanned++;
            const profileId = profile.id || profile._id?.toString() || 'global';
            const rawUi = profile.raw_ui_state;
            const uiState = profile.uiState;

            if (!rawUi && !uiState) continue;

            const targetUi = rawUi || uiState;
            const resSelected = cleanArray(targetUi.selectedPresets);
            const resOrder = cleanArray(targetUi.catalogOrder);

            if (resSelected.changed || resOrder.changed) {
                profilesModified++;
                console.log(`  - [${addonUuid}] Profilo '${profileId}' (${profile.name || 'senza nome'}):`);
                if (resSelected.removedDead.length > 0) {
                    console.log(`      * selectedPresets: rimossi ${resSelected.removedDead.length} ID morti (${resSelected.removedDead.join(', ')})`);
                }
                if (resSelected.addedLive.length > 0) {
                    console.log(`      * selectedPresets: aggiunti ${resSelected.addedLive.length} ID vivi (${resSelected.addedLive.join(', ')})`);
                }
                if (resOrder.removedDead.length > 0) {
                    console.log(`      * catalogOrder:    rimossi ${resOrder.removedDead.length} ID morti (${resOrder.removedDead.join(', ')})`);
                }
                if (resOrder.addedLive.length > 0) {
                    console.log(`      * catalogOrder:    aggiunti ${resOrder.addedLive.length} ID vivi (${resOrder.addedLive.join(', ')})`);
                }

                if (isApply) {
                    const updateFields = {};
                    if (rawUi) {
                        updateFields['profiles.$.raw_ui_state.selectedPresets'] = resSelected.cleaned;
                        updateFields['profiles.$.raw_ui_state.catalogOrder'] = resOrder.cleaned;
                    }
                    if (uiState) {
                        updateFields['profiles.$.uiState.selectedPresets'] = resSelected.cleaned;
                        updateFields['profiles.$.uiState.catalogOrder'] = resOrder.cleaned;
                    }

                    if (Object.keys(updateFields).length > 0) {
                        await AddonConfig.updateOne(
                            { _id: config._id, 'profiles.id': profileId },
                            { $set: updateFields }
                        );
                        recordsUpdated++;
                    }
                }
            }
        }
    }

    // Scansione eventuale collezione separata ProfileUiState
    let profileUiStateDocsScanned = 0;
    let profileUiStateDocsModified = 0;
    if (ProfileUiState && typeof ProfileUiState.find === 'function') {
        const uiQuery = targetUuid ? { addonUuid: targetUuid } : {};
        const uiDocs = await ProfileUiState.find(uiQuery).lean();
        profileUiStateDocsScanned = uiDocs.length;

        for (const doc of uiDocs) {
            const resSelected = cleanArray(doc.selectedPresets);
            const resOrder = cleanArray(doc.catalogOrder);

            if (resSelected.changed || resOrder.changed) {
                profileUiStateDocsModified++;
                console.log(`  - [ProfileUiState ${doc.addonUuid}/${doc.profileId}]:`);
                if (resSelected.removedDead.length > 0) {
                    console.log(`      * selectedPresets: rimossi ${resSelected.removedDead.length} ID morti`);
                }
                if (resSelected.addedLive.length > 0) {
                    console.log(`      * selectedPresets: aggiunti ${resSelected.addedLive.length} ID vivi`);
                }
                if (resOrder.removedDead.length > 0) {
                    console.log(`      * catalogOrder:    rimossi ${resOrder.removedDead.length} ID morti`);
                }
                if (resOrder.addedLive.length > 0) {
                    console.log(`      * catalogOrder:    aggiunti ${resOrder.addedLive.length} ID vivi`);
                }

                if (isApply) {
                    await ProfileUiState.updateOne(
                        { _id: doc._id },
                        {
                            $set: {
                                selectedPresets: resSelected.cleaned,
                                catalogOrder: resOrder.cleaned
                            }
                        }
                    );
                    recordsUpdated++;
                }
            }
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('RIASSUNTO MIGRAZIONE PRESET HERO:');
    console.log(`- Documenti AddonConfig scansionati:    ${configs.length}`);
    console.log(`- Profili analizzati in AddonConfig:   ${totalProfilesScanned}`);
    console.log(`- Profili che richiedono aggiornamento: ${profilesModified}`);
    if (profileUiStateDocsScanned > 0) {
        console.log(`- Record ProfileUiState analizzati:    ${profileUiStateDocsScanned}`);
        console.log(`- Record ProfileUiState da aggiornare: ${profileUiStateDocsModified}`);
    }
    console.log(`- Record scritti sul database:         ${isApply ? recordsUpdated : '0 (DRY-RUN)'}`);
    if (!isApply && (profilesModified > 0 || profileUiStateDocsModified > 0)) {
        console.log('\nPer applicare la migrazione, riesegui con: node scripts/migrate_hero_presets.js --apply');
    }
    console.log('='.repeat(70));

    return {
        configsScanned: configs.length,
        totalProfilesScanned,
        profilesModified,
        profileUiStateDocsScanned,
        profileUiStateDocsModified,
        recordsUpdated,
        isApply
    };
}

async function main() {
    let exitCode = 0;
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI mancante nelle variabili d\'ambiente.');
        }
        await connectMongo(mongoUri);
        await migrateHeroPresets();
    } catch (err) {
        console.error('Errore critico durante la migrazione dei preset hero:', err);
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
    migrateHeroPresets,
    cleanArray,
    DEAD_HERO_IDS,
    HERO_IDS
};
