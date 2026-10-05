#!/usr/bin/env node
/**
 * scripts/count-dead-posters.js
 *
 * Il metro del ticket 08: quante copertine di libreria sono servite da un host
 * ritirato. Si conta solo se il `poster` *inizia* con l'host morto — i poster che
 * lo *contengono* dentro i parametri `original=`/`fallback=` sono già corretti e
 * non vanno toccati.
 *
 * Uso: node scripts/count-dead-posters.js [--samples N]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const UserLibraryItem = require('../src/db/models/UserLibraryItem');

const DEAD_HOSTS = ['mate.taild24589.ts.net', 'gabriele-fuoco-yaca.hf.space'];
// L'host deve finire lì: `https://host.altro/a.png` non è un host morto.
const deadPattern = DEAD_HOSTS.map(h => `${h.replace(/\./g, '\\.')}(?:[/?#]|$)`).join('|');
const DEAD_RE = new RegExp(`^https?://(?:${deadPattern})`, 'i');

function parseArgs(argv) {
    const args = { samples: 5 };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--samples') args.samples = Number(argv[++i]);
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    await mongoose.connect(process.env.MONGODB_URI);

    const total = await UserLibraryItem.collection.countDocuments({});
    const dead = await UserLibraryItem.collection
        .find({ poster: DEAD_RE }, { projection: { itemId: 1, name: 1, poster: 1, duplicateOf: 1 } })
        .toArray();

    const perHost = {};
    for (const host of DEAD_HOSTS) {
        const re = new RegExp(`^https?://${host.replace(/\./g, '\\.')}(?:[/?#]|$)`, 'i');
        perHost[host] = await UserLibraryItem.collection.countDocuments({ poster: re });
    }

    console.log(JSON.stringify({
        totalDocuments: total,
        deadPosters: dead.length,
        perHost,
        at: new Date().toISOString()
    }));
    dead.slice(0, args.samples).forEach(d => console.log(`  ${d.itemId} ${d.name || ''}\n    ${d.poster}`));

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('Errore:', err.message);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});
