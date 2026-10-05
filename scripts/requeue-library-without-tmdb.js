#!/usr/bin/env node
/**
 * scripts/requeue-library-without-tmdb.js
 *
 * Il metro e la rimessa in coda degli item vivi che non hanno un TMDB id
 * (ticket 06). Un giro di conversione vecchio ha lasciato questi documenti con
 * `mapped: true` e `tmdbId: null`: la griglia li mostra ma i cataloghi non li
 * agganciano, perché nessuno sa più che sono da convertire.
 *
 * Qui si scrive UN SOLO campo, `mapped: false`, e nient'altro: gli item che il
 * giro precedente non ha toccato restano così come sono. I duplicati marcati
 * (`duplicateOf` valorizzato) restano fuori **per progetto**: sono la stessa
 * entità di un altro id già a posto, non un residuo da inseguire.
 *
 * Uso:
 *   node scripts/requeue-library-without-tmdb.js                 # solo il metro
 *   node scripts/requeue-library-without-tmdb.js --apply         # rimette in coda
 *   node scripts/requeue-library-without-tmdb.js --uuid <addonUuid>
 *
 * Dentro il container (senza lasciare file in produzione):
 *   ssh matebook-lan 'docker exec -i -e APP_DIR=/app --workdir /app yaca-app node -' \
 *     < scripts/requeue-library-without-tmdb.js
 *   (idem con `--apply` in coda agli argomenti: `node - --apply`)
 */

'use strict';
const path = require('path');
const mongoose = require('mongoose');

const APP = process.env.APP_DIR || path.join(__dirname, '..');
const UserAccount = require(path.join(APP, 'src/db/models/UserAccount'));
const UserLibraryItem = require(path.join(APP, 'src/db/models/UserLibraryItem'));

require(path.join(APP, 'node_modules/dotenv')).config({ path: path.join(APP, '.env') });

function parseArgs(argv) {
    const args = { uuid: null, apply: false };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--uuid') args.uuid = argv[++i];
        else if (argv[i] === '--apply') args.apply = true;
    }
    return args;
}

const line = (doc) => `  ${JSON.stringify({
    itemId: doc.itemId,
    name: doc.name,
    type: doc.type,
    mapped: doc.mapped,
    duplicateOf: doc.duplicateOf || null
})}`;

async function main() {
    const args = parseArgs(process.argv.slice(2));
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000, bufferTimeoutMS: 60000 });

    const users = args.uuid
        ? [{ addonUuid: args.uuid, userId: null }]
        : (await UserAccount.find({}, { userId: 1, addonUuid: 1 }).lean());
    if (users.length === 0) {
        console.error('Nessuna libreria da guardare.');
        await mongoose.disconnect();
        process.exit(1);
    }

    const raw = UserLibraryItem.collection;
    for (const user of users) {
        const vivi = await raw.find(
            { addonUuid: user.addonUuid, removed: false, tmdbId: null },
            { projection: { itemId: 1, name: 1, type: 1, mapped: 1, duplicateOf: 1 } }
        ).toArray();

        const duplicati = vivi.filter(d => d.duplicateOf);
        const eleggibili = vivi.filter(d => !d.duplicateOf);

        console.log(`\n=== libreria ${user.addonUuid} ===`);
        console.log(`Item vivi senza TMDB id: ${vivi.length}`);
        console.log(`  di cui duplicati marcati (restano fuori per progetto): ${duplicati.length}`);
        for (const doc of duplicati) console.log(line(doc));
        console.log(`  di cui rimettibili in coda: ${eleggibili.length}`);

        if (args.apply) {
            if (eleggibili.length === 0) {
                console.log('  Niente da rimettere in coda.');
            } else {
                // UN solo campo. Nessuna cancellazione, nessun altro campo toccato.
                const res = await raw.updateMany(
                    { _id: { $in: eleggibili.map(d => d._id) } },
                    { $set: { mapped: false } }
                );
                console.log(`  Rimessi in coda (mapped: false): ${res.modifiedCount}`);
            }
        } else {
            console.log('  (solo metro: nessuna scrittura. usa --apply per rimetterli in coda)');
        }
    }

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('Errore:', err.message);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});
