#!/usr/bin/env node
/**
 * scripts/migrate_library_itemid_null.js
 *
 * Migrazione una-tantum per normalizzare i record legacy in UserLibraryItem
 * aventi itemId === null e _id stringa (es. 'kitsu:142', 'tmdb: 12477 ').
 *
 * SICUREZZA:
 * - Di DEFAULT viene eseguito in modalità DRY-RUN (nessuna scrittura).
 * - Per applicare le modifiche su DB è necessario passare il flag esplicito:
 *     node scripts/migrate_library_itemid_null.js --apply
 *   oppure:
 *     node scripts/migrate_library_itemid_null.js --execute
 * - Opzionale: filtrare per un singolo addonUuid:
 *     node scripts/migrate_library_itemid_null.js --uuid=ff7084d8-904b-42d9-91f5-ea2b4ae37590
 *
 * REGOLE AGENTI:
 * - NON eseguire questo script in produzione senza previa autorizzazione e backup.
 */

const path = require('path');
const fs = require('fs');

// Carica variabili d'ambiente
const envPath = fs.existsSync(path.resolve(__dirname, '../.env'))
    ? path.resolve(__dirname, '../.env')
    : path.resolve(__dirname, '../../YACA/.env');
require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');

function normalizeLegacyId(rawId) {
    if (!rawId) return null;
    let str = String(rawId).trim();
    // Rimuove spazi dopo il prefisso provider, es. 'tmdb: 12477 ' -> 'tmdb:12477'
    str = str.replace(/^(tmdb|kitsu|hanime|anilist):\s+/i, '$1:').trim();
    return str;
}

async function migrateLibraryItemIdNull(options = {}) {
    const isApply = Boolean(options.apply || process.argv.includes('--apply') || process.argv.includes('--execute'));
    const targetUuid = options.uuid || process.argv.find(arg => arg.startsWith('--uuid='))?.split('=')[1] || null;

    console.log('='.repeat(70));
    console.log(`[MIGRAZIONE UserLibraryItem: itemId: null]`);
    console.log(`MODALITÀ: ${isApply ? '⚠️  APPLICAZIONE REALE SUL DATABASE' : '🔍 DRY-RUN (Nessuna modifica verrà scritta)'}`);
    if (targetUuid) {
        console.log(`FILTRO UUID: ${targetUuid}`);
    }
    console.log('='.repeat(70));

    const UserLibraryItem = require('../src/db/models/UserLibraryItem');

    const query = {
        itemId: null
    };
    if (targetUuid) {
        query.addonUuid = targetUuid;
    }

    const legacyDocs = await UserLibraryItem.find(query).lean();
    console.log(`Documenti legacy trovati con itemId === null: ${legacyDocs.length}`);

    if (legacyDocs.length === 0) {
        console.log('Nessun documento legacy trovato da migrare.');
        return { total: 0, normalized: 0, duplicatesRemoved: 0, errors: 0, isApply };
    }

    let countNormalized = 0;
    let countDuplicatesRemoved = 0;
    let countErrors = 0;

    for (const doc of legacyDocs) {
        try {
            const rawId = doc._id;
            const normalizedId = normalizeLegacyId(rawId);

            if (!normalizedId) {
                console.warn(`[WARN] Impossibile normalizzare _id non valido per doc ${doc._id}`);
                countErrors++;
                continue;
            }

            // Controlla se esiste già un documento con lo stesso addonUuid e il normalizedId
            const existingDoc = await UserLibraryItem.findOne({
                addonUuid: doc.addonUuid,
                itemId: normalizedId,
                _id: { $ne: doc._id }
            }).lean();

            if (existingDoc) {
                // Duplicato presente: merge/rimozione del record legacy
                if (isApply) {
                    await UserLibraryItem.deleteOne({ _id: doc._id });
                    console.log(`[DELETE] Rimosso record legacy duplicato: _id="${rawId}" (target _id="${existingDoc._id}", itemId="${normalizedId}")`);
                } else {
                    console.log(`[DRY-RUN] Duplicato rilevato: _id="${rawId}" colliderebbe con doc esistente ${existingDoc._id} (itemId="${normalizedId}"). Azione pianificata: rimozione record legacy.`);
                }
                countDuplicatesRemoved++;
            } else {
                // Nessun duplicato: imposta itemId sul record
                if (isApply) {
                    await UserLibraryItem.updateOne(
                        { _id: doc._id },
                        { $set: { itemId: normalizedId } }
                    );
                    console.log(`[UPDATE] Normalizzato record: _id="${rawId}" -> itemId="${normalizedId}"`);
                } else {
                    console.log(`[DRY-RUN] Normalizzazione pianificata: _id="${rawId}" -> itemId="${normalizedId}"`);
                }
                countNormalized++;
            }
        } catch (err) {
            console.error(`[ERROR] Errore elaborazione doc ${doc._id}:`, err.message);
            countErrors++;
        }
    }

    console.log('-'.repeat(70));
    console.log(`SOMMARIO MIGRAZIONE (${isApply ? 'APPLIED' : 'DRY-RUN'}):`);
    console.log(`  Totale esaminati:         ${legacyDocs.length}`);
    console.log(`  Normalizzati (itemId set): ${countNormalized}`);
    console.log(`  Duplicati rimossi/merge:  ${countDuplicatesRemoved}`);
    console.log(`  Errori:                   ${countErrors}`);
    console.log('='.repeat(70));

    return {
        total: legacyDocs.length,
        normalized: countNormalized,
        duplicatesRemoved: countDuplicatesRemoved,
        errors: countErrors,
        isApply
    };
}

// Esecuzione CLI standalone
if (require.main === module) {
    (async () => {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('ERRORE: MONGODB_URI mancante nelle variabili d\'ambiente.');
            process.exit(1);
        }

        try {
            console.log('Connessione a MongoDB...');
            await mongoose.connect(mongoUri);
            console.log('Connessione stabilita.');

            await migrateLibraryItemIdNull();

            await mongoose.disconnect();
            console.log('Connessione MongoDB chiusa.');
            process.exit(0);
        } catch (err) {
            console.error('Errore fatale nello script:', err);
            try { await mongoose.disconnect(); } catch (_) {}
            process.exit(1);
        }
    })();
}

module.exports = {
    normalizeLegacyId,
    migrateLibraryItemIdNull
};
