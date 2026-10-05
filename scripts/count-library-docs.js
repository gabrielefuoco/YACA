#!/usr/bin/env node
/**
 * scripts/count-library-docs.js
 *
 * Il metro del sync: conta i documenti di libreria e mostra gli identificativi
 * "sporchi" (spazi, maiuscole) che un giro di sync non dovrebbe più lasciare
 * indietro. Serve a verificare a mano che due giri consecutivi non facciano
 * crescere il conteggio (205 → 206 al tempo del ticket 09).
 *
 * Uso: node scripts/count-library-docs.js [--uuid <addonUuid>]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const UserLibraryItem = require('../src/db/models/UserLibraryItem');
const { normalizeLibraryId } = require('../src/utils/libraryIdentity');

function parseArgs(argv) {
    const args = { uuid: null };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--uuid') args.uuid = argv[++i];
    }
    return args;
}

async function main() {
    const { uuid } = parseArgs(process.argv.slice(2));
    // Atlas risponde in qualche secondo al primo giro: i 10s di default del buffer
    // non bastano e la query muore "buffering timed out" senza toccare il DB.
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000, bufferTimeoutMS: 60000 });
    const filter = uuid ? { addonUuid: uuid } : {};
    const col = UserLibraryItem.collection;

    const total = await col.countDocuments(filter);
    const docs = await col.find(filter, { projection: { itemId: 1, duplicateOf: 1 } }).toArray();
    const sporchi = docs.filter(d => {
        const stored = String(d?.itemId || '');
        return stored && normalizeLibraryId(stored) !== stored;
    });

    console.log(`Documenti di libreria: ${total}`);
    console.log(`Identificativi sporchi: ${sporchi.length}`);
    for (const doc of sporchi.slice(0, 20)) {
        console.log(`  ${JSON.stringify(doc.itemId)} → ${normalizeLibraryId(doc.itemId)}`
            + (doc.duplicateOf ? ` (duplicateOf ${doc.duplicateOf})` : ''));
    }

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('Errore:', err.message);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});