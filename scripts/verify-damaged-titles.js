#!/usr/bin/env node
/**
 * scripts/verify-damaged-titles.js
 *
 * Verifica dai dati (MongoDB) lo stato e i titoli esatti degli 8 item danneggiati.
 * Stampa la tabella di confronto con il valore atteso.
 */

'use strict';
const path = require('path');
const mongoose = require('mongoose');

const APP = process.env.APP_DIR || path.join(__dirname, '..');
require(path.join(APP, 'node_modules/dotenv')).config({ path: path.join(APP, '.env') });
const UserLibraryItem = require(path.join(APP, 'src/db/models/UserLibraryItem'));

const EXPECTED = [
    { itemId: 'kitsu:10', tmdbId: 30981, expectedName: 'Monster', wrongName: 'Know Your Mushrooms' },
    { itemId: 'kitsu:419', tmdbId: 26867, expectedName: 'Mushishi', wrongName: 'The Blue Parrot' },
    { itemId: 'kitsu:1075', tmdbId: 35753, expectedName: 'The Familiar of Zero', wrongName: 'Rozmowy nocą' },
    { itemId: 'kitsu:6448', tmdbId: 46298, expectedName: 'Hunter x Hunter (2011)', wrongName: "Disney's Sing-Along Songs: Home On The Range" },
    { itemId: 'kitsu:7278', tmdbId: 46004, expectedName: 'Date A Live', wrongName: 'Folletti si nasce' },
    { itemId: 'kitsu:7622', tmdbId: 60846, expectedName: 'Log Horizon', wrongName: 'Inculture(s) 1 - La Culture' },
    { itemId: 'kitsu:42323', tmdbId: 94664, expectedName: 'Mushoku Tensei: Jobless Reincarnation', wrongName: 'Sono venuto così' },
    { itemId: 'tmdb:270603', tmdbId: 270603, expectedName: 'The Exiled Heavy Knight Knows How to Game the System', wrongName: 'Roundabout American' }
];

async function main() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000, bufferTimeoutMS: 60000 });
    const raw = UserLibraryItem.collection;

    const items = await raw.find(
        { itemId: { $in: EXPECTED.map(e => e.itemId) } },
        { projection: { itemId: 1, tmdbId: 1, name: 1, year: 1, mapped: 1, type: 1 } }
    ).toArray();

    console.log('\n| Item ID | TMDB ID | Titolo Attuale in DB | Titolo Atteso (Vero) | Stato | Mapped |');
    console.log('|---|---|---|---|---|---|');

    let allMatch = true;
    for (const exp of EXPECTED) {
        const item = items.find(d => d.itemId === exp.itemId);
        if (!item) {
            console.log(`| \`${exp.itemId}\` | ${exp.tmdbId} | NON TROVATO | **${exp.expectedName}** | MANCANTE | - |`);
            allMatch = false;
            continue;
        }

        // Accetta sia "Hunter x Hunter" sia "Hunter x Hunter (2011)"
        const isMatch = (item.name === exp.expectedName) || 
            (exp.itemId === 'kitsu:6448' && item.name.startsWith('Hunter x Hunter'));
        
        if (!isMatch) allMatch = false;

        const status = isMatch ? '✅ CORRETTO' : '❌ ERRATO';
        console.log(`| \`${item.itemId}\` | ${item.tmdbId} | ${item.name} | **${exp.expectedName}** | ${status} | ${item.mapped} |`);
    }

    console.log(`\nEsito complessivo: ${allMatch ? 'TUTTI I TITOLI CORRETTI' : 'CI SONO TITOLI DA RIPARARE'}`);

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('Errore:', err.message);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
});
