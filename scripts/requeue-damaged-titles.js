#!/usr/bin/env node
/**
 * scripts/requeue-damaged-titles.js
 *
 * Rimette in coda ESATTAMENTE gli 8 item anime con titolo corrotto dal danno
 * da collisione numerica TMDB (Ticket 14).
 *
 * Scrive UN SOLO campo: `mapped: false`.
 * Nessun altro item viene toccato. kitsu:1657 e kitsu:8313 sono esplicitamente
 * vietati e protetti.
 *
 * Uso:
 *   node scripts/requeue-damaged-titles.js          # solo metro / verifica (nessuna scrittura)
 *   node scripts/requeue-damaged-titles.js --apply  # applica mapped: false agli 8
 */

'use strict';
const path = require('path');
const mongoose = require('mongoose');

const APP = process.env.APP_DIR || path.join(__dirname, '..');
require(path.join(APP, 'node_modules/dotenv')).config({ path: path.join(APP, '.env') });
const UserLibraryItem = require(path.join(APP, 'src/db/models/UserLibraryItem'));

const TARGET_IDS = Object.freeze([
    'kitsu:10',
    'kitsu:419',
    'kitsu:1075',
    'kitsu:6448',
    'kitsu:7278',
    'kitsu:7622',
    'kitsu:42323',
    'tmdb:270603'
]);

const FORBIDDEN_IDS = Object.freeze([
    'kitsu:1657',
    'kitsu:8313'
]);

function parseArgs(argv) {
    const args = { apply: false };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--apply') args.apply = true;
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000, bufferTimeoutMS: 60000 });
    const raw = UserLibraryItem.collection;

    // Controllo di sicurezza: nessun ID vietato tra i target
    for (const fId of FORBIDDEN_IDS) {
        if (TARGET_IDS.includes(fId)) {
            console.error(`ERRORE DI SICUREZZA: ${fId} è presente nei TARGET_IDS! Abort.`);
            await mongoose.disconnect();
            process.exit(1);
        }
    }

    const items = await raw.find(
        { itemId: { $in: TARGET_IDS } },
        { projection: { itemId: 1, name: 1, tmdbId: 1, mapped: 1, duplicateOf: 1, type: 1 } }
    ).toArray();

    console.log(`\n=== Verifica degli 8 item danneggiati (trovati: ${items.length}/8) ===`);
    for (const item of items) {
        console.log(`  ${JSON.stringify({
            itemId: item.itemId,
            tmdbId: item.tmdbId,
            name: item.name,
            mapped: item.mapped,
            duplicateOf: item.duplicateOf || null
        })}`);
    }

    if (items.length !== TARGET_IDS.length) {
        console.error(`ATTENZIONE: attesi ${TARGET_IDS.length} item, trovati ${items.length}!`);
    }

    if (args.apply) {
        console.log('\nApplicazione rimessa in coda (mapped: false) su esattamente gli 8 item...');
        const res = await raw.updateMany(
            { itemId: { $in: TARGET_IDS } },
            { $set: { mapped: false } }
        );
        console.log(`Aggiornati con successo: ${res.modifiedCount} documenti.`);

        const postItems = await raw.find(
            { itemId: { $in: TARGET_IDS } },
            { projection: { itemId: 1, name: 1, mapped: 1 } }
        ).toArray();
        console.log('Stato dopo la rimessa in coda:');
        for (const item of postItems) {
            console.log(`  ${item.itemId} -> mapped: ${item.mapped}`);
        }
    } else {
        console.log('\n(Nessuna modifica effettuata. Usa --apply per rimettere in coda)');
    }

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('Errore:', err.message);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});
