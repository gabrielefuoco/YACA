#!/usr/bin/env node
/**
 * scripts/sync-library-once.js
 *
 * Giro di sync di libreria una tantum, senza attendere una richiesta di
 * catalogo: chiama direttamente `LibrarySyncService.syncLibraryForUser(userId)`
 * per un utente o per tutti. Serve a verificare sul campo che la normalizzazione
 * delle copertine introdotta dal sync regga (ticket 08).
 *
 * Uso: node scripts/sync-library-once.js [--userId <id>] [--all]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('../src/db/models/UserAccount');
const LibrarySyncService = require('../src/services/LibrarySyncService');
const animeMappingStore = require('../src/data/animeMappingStore');

function parseArgs(argv) {
    const args = { userId: null, all: false };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--userId') args.userId = argv[++i];
        else if (argv[i] === '--all') args.all = true;
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.userId && !args.all) {
        console.error('Serve --userId <id> oppure --all.');
        process.exit(1);
    }

    // Atlas risponde in qualche secondo al primo giro: i 10s di default del buffer
    // non bastano e la query muore "buffering timed out" senza toccare il DB.
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000, bufferTimeoutMS: 60000 });

    // La mappatura Kitsu→TMDB vive in memoria nel processo dell'app: qui il processo
    // è nuovo, quindi si inizializza lo store condiviso (la stessa sorgente che l'app
    // usa all'avvio). Senza, gli item Kitsu non si risolvono e il piano dei duplicati
    // resta incompleto — lo stesso tranello annotato in `convert-library-once.js`.
    try {
        await animeMappingStore.init();
        console.log(`Mapping Kitsu→TMDB caricato: ${animeMappingStore.kitsuToTmdb?.size ?? 0} chiavi`);
    } catch (err) {
        console.warn(`Mapping Kitsu→TMDB non disponibile (${err.message}): il piano dei duplicati resterà incompleto per gli item Kitsu`);
    }

    const userIds = args.all
        ? (await UserAccount.find({}, { userId: 1 }).lean()).map(u => u.userId).filter(Boolean)
        : [args.userId];

    console.log(`Utenti da sincronizzare: ${userIds.length}`);
    for (const userId of userIds) {
        console.log(`\n=== sync ${userId} ===`);
        await LibrarySyncService.syncLibraryForUser(userId);
    }

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('Errore:', err.message);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});
