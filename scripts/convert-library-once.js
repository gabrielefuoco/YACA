#!/usr/bin/env node
/**
 * scripts/convert-library-once.js
 *
 * Giro di conversione della libreria una tantum, senza attendere una richiesta
 * di catalogo: chiama direttamente `LibraryConverterService.convertAll(userId)`.
 * Serve al ticket 06 per rimettere in coda gli item vivi senza TMDB id e farli
 * girare con il codice dell'immagine in produzione (lo script gira DENTRO il
 * container, così usa lo stesso codice e le stesse dipendenze dell'app).
 *
 * La mappatura Kitsu→TMDB vive in memoria nel processo dell'app: qui il processo
 * è nuovo, quindi si inizializza lo store condiviso (`animeMappingStore.init()`,
 * la stessa sorgente che l'app usa all'avvio) altrimenti gli item Kitsu
 * risulterebbero irrisolvibili e il giro non convertirebbe niente.
 *
 * Uso:
 *   node scripts/convert-library-once.js [--userId <id>] [--all] [--dry-map]
 *
 *   --dry-map  non converte: dice solo quanti item Kitsu la mappatura risolve
 *              fra quelli rimessi in coda (metro, zero scritture).
 *
 * Dentro il container (senza lasciare file in produzione):
 *   ssh matebook-lan 'docker exec -i -e APP_DIR=/app --workdir /app yaca-app node - --all' \
 *     < scripts/convert-library-once.js
 */

'use strict';
const path = require('path');
const mongoose = require('mongoose');

const APP = process.env.APP_DIR || path.join(__dirname, '..');
require(path.join(APP, 'node_modules/dotenv')).config({ path: path.join(APP, '.env') });
const UserAccount = require(path.join(APP, 'src/db/models/UserAccount'));
const UserLibraryItem = require(path.join(APP, 'src/db/models/UserLibraryItem'));
const LibraryConverterService = require(path.join(APP, 'src/services/LibraryConverterService'));
const animeMappingStore = require(path.join(APP, 'src/data/animeMappingStore'));

function parseArgs(argv) {
    const args = { userId: null, all: false, dryMap: false };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--userId') args.userId = argv[++i];
        else if (argv[i] === '--all') args.all = true;
        else if (argv[i] === '--dry-map') args.dryMap = true;
    }
    return args;
}

async function census(raw, addonUuid) {
    const vivi = await raw.find(
        { addonUuid, removed: false, tmdbId: null },
        { projection: { itemId: 1, name: 1, mapped: 1, duplicateOf: 1 } }
    ).toArray();
    return {
        tot: vivi.length,
        duplicati: vivi.filter(d => d.duplicateOf),
        eleggibili: vivi.filter(d => !d.duplicateOf)
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.userId && !args.all) {
        console.error('Serve --userId <id> oppure --all.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000, bufferTimeoutMS: 60000 });
    const raw = UserLibraryItem.collection;
    const users = args.all
        ? (await UserAccount.find({}, { userId: 1, addonUuid: 1 }).lean())
        : (await UserAccount.find({ userId: args.userId }, { userId: 1, addonUuid: 1 }).lean());
    if (users.length === 0) {
        console.error('Nessun utente trovato.');
        await mongoose.disconnect();
        process.exit(1);
    }

    if (args.dryMap) {
        // Zero scritture: si guarda solo cosa sa dire la mappatura condivisa.
        await animeMappingStore.init();
        console.log(`Mappatura Kitsu in memoria: ${animeMappingStore.kitsuToTmdb?.size || 0} chiavi`);
        for (const user of users) {
            const prima = await census(raw, user.addonUuid);
            let risolti = 0;
            for (const doc of prima.eleggibili) {
                const kitsu = String(doc.itemId || '').match(/^kitsu:(\d+)$/i);
                const tmdb = kitsu ? animeMappingStore.resolveTmdbFromKitsu(kitsu[1]) : null;
                if (tmdb) risolti++;
                console.log(`  ${JSON.stringify({ itemId: doc.itemId, name: doc.name, kitsuRisolto: tmdb || null })}`);
            }
            console.log(`Risolti dalla mappatura: ${risolti}/${prima.eleggibili.length} (duplicati marcati esclusi: ${prima.duplicati.length})`);
        }
        await mongoose.disconnect();
        process.exit(0);
    }

    const before = {};
    for (const user of users) {
        const c = await census(raw, user.addonUuid);
        before[user.userId] = { eleggibili: c.eleggibili.length, duplicati: c.duplicati.length, ids: new Set(c.eleggibili.map(d => String(d.itemId))) };
    }

    if (!animeMappingStore.isReady) {
        console.log('Inizializzo la mappatura condivisa Kitsu→TMDB (stessa sorgente dell\'app)…');
        await animeMappingStore.init();
    }
    console.log(`Mappatura Kitsu in memoria: ${animeMappingStore.kitsuToTmdb?.size || 0} chiavi`);

    for (const user of users) {
        console.log(`\n=== conversione ${user.userId} ===`);
        await LibraryConverterService.convertAll(user.userId, process.env.HOST_URL);
    }

    for (const user of users) {
        const dopo = await census(raw, user.addonUuid);
        const convertiti = dopo.eleggibili.filter(d => before[user.userId].ids.has(String(d.itemId))).length;
        console.log(`\n=== esito ${user.userId} ===`);
        console.log(`  rimessi in coda: ${before[user.userId].eleggibili.length}`);
        console.log(`  ancora senza TMDB id: ${dopo.eleggibili.length} (di cui ${convertiti} non convertiti dal giro)`);
        console.log(`  duplicati marcati, fuori per progetto: ${dopo.duplicati.length}`);
        for (const doc of dopo.eleggibili) console.log(`    residuo: ${JSON.stringify({ itemId: doc.itemId, name: doc.name, mapped: doc.mapped })}`);
        for (const doc of dopo.duplicati) console.log(`    duplicato: ${JSON.stringify({ itemId: doc.itemId, name: doc.name, duplicateOf: doc.duplicateOf })}`);
    }

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('Errore:', err.message);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});
