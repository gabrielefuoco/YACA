#!/usr/bin/env node
/**
 * scripts/repair-library-data.js
 *
 * Manutenzione dei dati di libreria su Atlas:
 *   1. riscrive le copertine servite da host non più raggiungibili (vecchio HF Space,
 *      localhost di sviluppo) verso l'host corrente, così la griglia non mostra
 *      più il placeholder al posto dell'immagine;
 *   2. marca i duplicati: lo stesso titolo presente con id diversi (`tt…`, `tmdb:…`,
 *      `kitsu:…`) riceve `duplicateOf` sul documento secondario, che dashboard e
 *      cataloghi escludono dalle letture.
 *
 * I documenti NON vengono cancellati: Stremio è la fonte e al prossimo sync
 * tornerebbero. Il marcatore è reversibile (viene comunque ricalcolato ad ogni sync).
 *
 * Uso:
 *   node scripts/repair-library-data.js [--uuid <addonUuid>] [--host <url>] [--apply]
 *
 * Senza `--apply` è un dry-run: mostra cosa cambierebbe e non scrive nulla.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const UserLibraryItem = require('../src/db/models/UserLibraryItem');
const {
    normalizeLegacyPosterHost,
    planDuplicateMarks,
    applyDuplicateMarks,
    LEGACY_APP_HOSTS
} = require('../src/utils/libraryIdentity');

function parseArgs(argv) {
    const args = { apply: false, uuid: null, host: null };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--apply') args.apply = true;
        else if (arg === '--uuid') args.uuid = argv[++i];
        else if (arg === '--host') args.host = argv[++i];
        else if (arg === '--help' || arg === '-h') args.help = true;
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]);
        return;
    }

    const host = (args.host || process.env.HOST_URL || '').replace(/\/+$/, '');
    if (!host) {
        console.error('Serve --host <url> oppure HOST_URL nell\'ambiente.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    // Il mapping Kitsu→TMDB è ciò che unisce gli id anime in produzione: senza,
    // due copie dello stesso anime (kitsu:… e tt…) non verrebbero riconosciute.
    try {
        const animeMappingStore = require('../src/data/animeMappingStore');
        if (typeof animeMappingStore.init === 'function') {
            await animeMappingStore.init();
            console.log(`Mapping Kitsu→TMDB caricato: ${animeMappingStore.kitsuToTmdb?.size ?? 0} chiavi`);
        }
    } catch (err) {
        console.warn(`Mapping Kitsu→TMDB non disponibile (${err.message}): si prosegue con gli id IMDb/TMDB`);
    }

    const filter = args.uuid ? { addonUuid: args.uuid } : {};
    const items = await UserLibraryItem.collection.find(filter).toArray();
    console.log(`Documenti di libreria: ${items.length}${args.uuid ? ` (addonUuid ${args.uuid})` : ''}`);
    console.log(`Host corrente usato per le copertine: ${host}`);
    console.log(`Modalità: ${args.apply ? 'APPLY' : 'DRY-RUN'}\n`);

    // ── 1. Copertine su host legacy ────────────────────────────────────────────
    const posterUpdates = [];
    for (const item of items) {
        const poster = item.poster;
        if (typeof poster !== 'string' || !poster.trim()) continue;
        const fixed = normalizeLegacyPosterHost(poster, host);
        if (fixed !== poster) {
            posterUpdates.push({ _id: item._id, itemId: item.itemId, from: poster, to: fixed });
        }
    }

    console.log(`[1] Copertine da riparare: ${posterUpdates.length}`);
    posterUpdates.slice(0, 10).forEach(u => {
        console.log(`    ${u.itemId}\n      - ${u.from}\n      + ${u.to}`);
    });
    if (posterUpdates.length > 10) console.log(`    … e altre ${posterUpdates.length - 10}`);
    console.log(`    (host legacy noti: ${LEGACY_APP_HOSTS.join(', ')})`);

    // ── 2. Duplicati ───────────────────────────────────────────────────────────
    const plan = await planDuplicateMarks(items);
    const duplicates = [...plan.entries()].filter(([, primary]) => primary);
    const alreadyMarked = items.filter(i => i.duplicateOf).length;

    console.log(`\n[2] Duplicati da marcare: ${duplicates.length} (già marcati: ${alreadyMarked})`);
    duplicates.forEach(([itemId, primary]) => {
        const doc = items.find(i => String(i.itemId) === itemId);
        console.log(`    ${itemId} (${doc?.name || '?'}) → nascosto a favore di ${primary}`);
    });

    if (!args.apply) {
        console.log('\nDry-run: nessuna scrittura eseguita. Rilancia con --apply per applicare.');
        await mongoose.disconnect();
        return;
    }

    const raw = UserLibraryItem.collection;
    for (const update of posterUpdates) {
        await raw.updateOne({ _id: update._id }, { $set: { poster: update.to } });
    }
    console.log(`\n✔ Copertine aggiornate: ${posterUpdates.length}`);

    const uuids = args.uuid ? [args.uuid] : Array.from(new Set(items.map(i => i.addonUuid)));
    let marked = 0;
    for (const uuid of uuids) {
        const result = await applyDuplicateMarks(uuid);
        marked += result.duplicates;
    }
    console.log(`✔ Duplicati marcati: ${marked}`);

    await mongoose.disconnect();
    // Il sync periodico del mapping anime tiene vivo il processo: uscita esplicita.
    process.exit(0);
}

main().catch(async (err) => {
    console.error('Errore:', err.message);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});
