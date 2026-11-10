#!/usr/bin/env node
/**
 * Riscrive una volta sola i poster che puntano a host ritirati.
 *
 * PERCHÉ ESISTE. Fino a ieri la riscrittura avveniva **a ogni lettura** della libreria
 * (`normalizeLegacyPosterHost` dentro `GET /api/profilo/libreria`): una migrazione
 * eseguita per sempre, su ogni elemento, a ogni richiesta. Era una correzione una tantum
 * travestita da regola di dominio.
 *
 * Gli host qui sotto non servono più le immagini: il vecchio HF Space risponde con una
 * pagina HTML e la tailnet è stata rinominata in `hyena-alphard.ts.net` il 2026-10-05,
 * quindi i poster salvati con il nome vecchio non si caricano più.
 *
 * USO
 *   node scripts/migra-host-poster.js            → prova, elenca i poster da correggere
 *   node scripts/migra-host-poster.js --conferma → riscrive
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

/** Host ritirati: la loro parte iniziale viene sostituita da `APP_HOST_URL`. */
const HOST_RITIRATI = [
    'gabriele-fuoco-yaca.hf.space',
    'mate.taild24589.ts.net',
    'http://localhost:7000',
    'https://localhost:7000'
];

function normalizza(poster, hostAttuale) {
    const valore = String(poster ?? '').trim();
    if (!valore) return poster;
    const destinazione = String(hostAttuale || '').replace(/\/+$/, '');
    if (!destinazione) return poster;

    const spogliato = valore.replace(/^https?:\/\//i, '');
    for (const host of HOST_RITIRATI) {
        const hostSpogliato = String(host).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        if (!hostSpogliato || !spogliato.startsWith(hostSpogliato)) continue;
        const resto = spogliato.slice(hostSpogliato.length);
        return `${destinazione}${resto.startsWith('/') ? resto : `/${resto}`}`;
    }
    return poster;
}

async function main() {
    const conferma = process.argv.includes('--conferma');
    const host = process.env.APP_HOST_URL || process.env.HOST_URL;
    if (!host) {
        console.error('APP_HOST_URL/HOST_URL assente: non so verso quale host riscrivere.');
        process.exit(1);
    }
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI assente.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    const libreria = mongoose.connection.db.collection('userlibraryitems');

    const documenti = await libreria
        .find({ poster: { $type: 'string', $ne: '' } }, { projection: { itemId: 1, poster: 1 } })
        .toArray();

    const daCorreggere = [];
    for (const doc of documenti) {
        const nuovo = normalizza(doc.poster, host);
        if (nuovo !== doc.poster) daCorreggere.push({ _id: doc._id, itemId: doc.itemId, prima: doc.poster, dopo: nuovo });
    }

    console.log(`elementi con un poster: ${documenti.length}`);
    console.log(`poster su un host ritirato: ${daCorreggere.length} (destinazione ${host})`);
    for (const d of daCorreggere.slice(0, 10)) {
        console.log(`  ${d.itemId}: ${d.prima.slice(0, 70)} → ${d.dopo.slice(0, 70)}`);
    }

    if (!conferma) {
        console.log('\nPROVA. Non è stato scritto niente. Rilancia con --conferma per applicare.');
        await mongoose.disconnect();
        return;
    }
    if (daCorreggere.length === 0) {
        await mongoose.disconnect();
        return;
    }

    const esito = await libreria.bulkWrite(
        daCorreggere.map(d => ({ updateOne: { filter: { _id: d._id }, update: { $set: { poster: d.dopo } } } })),
        { ordered: false }
    );
    console.log(`\nAPPLICATO: ${esito.modifiedCount || 0} poster riscritti.`);
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('Errore durante la migrazione:', err.message);
    try { await mongoose.disconnect(); } catch (_e) { /* niente */ }
    process.exit(1);
});
