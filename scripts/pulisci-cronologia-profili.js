#!/usr/bin/env node
/**
 * Pulisce i profili vecchi e la cronologia duplicata.
 *
 * COSA È SUCCESSO. La cronologia veniva copiata in OGNI contesto dell'account: quattro
 * profili vecchi, cinque profili di test (`sim_prof_ocean_*`) e i cinque modi. Lo stesso
 * titolo esisteva in quindici documenti, ognuno con il proprio contatore di visioni
 * gonfiato di uno a ogni sincronizzazione.
 *
 * COSA FA ADESSO IL CODICE. La storia è della persona: una copia sola, nel contesto
 * dell'account (`global`). I modi la leggono e filtrano il risultato con le proprie leve.
 *
 * COSA FA QUESTO SCRIPT
 *   1. cancella i documenti di cronologia che non stanno in `global` (copie);
 *   2. toglie dall'account i profili vecchi e quelli di test, lasciando `global` e i modi.
 *
 * Non tocca i titoli in `global`: quelli si correggono con `ripara-cronologia.js`.
 *
 * USO
 *   node scripts/pulisci-cronologia-profili.js            → prova
 *   node scripts/pulisci-cronologia-profili.js --conferma → applica
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

/**
 * Due regole diverse, e la differenza è il punto.
 *
 *  - La CRONOLOGIA vive solo in `global`: è della persona, una copia. Anche i modi non ne
 *    tengono una propria — la leggono e filtrano.
 *  - I PROFILI `modo_*` restano: sono la configurazione dei cinque modi, non cronologia.
 */
function contestoStoriaDaTenere(contexto) {
    return String(contexto || '') === 'global';
}

function profiloDaTenere(id) {
    const c = String(id || '');
    return c === 'global' || c.startsWith('modo_');
}

async function main() {
    const conferma = process.argv.includes('--conferma');
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI assente: impossibile procedere.');
        process.exit(1);
    }

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const cronologia = db.collection('watchhistories');
    const account = db.collection('addonconfigs');

    // ── 1. Documenti di cronologia fuori da `global` ────────────────────────────────
    const perContesto = await cronologia.aggregate([
        { $group: { _id: '$context', n: { $sum: 1 } } },
        { $sort: { n: -1 } }
    ]).toArray();

    const daCancellare = perContesto.filter(r => !contestoStoriaDaTenere(r._id));
    const daTenere = perContesto.filter(r => contestoStoriaDaTenere(r._id));
    console.log(`documenti di cronologia: ${perContesto.reduce((s, r) => s + r.n, 0)} in ${perContesto.length} contesti`);
    console.log('  si tengono:');
    for (const r of daTenere) console.log(`    ${String(r._id).padEnd(24)} ${String(r.n).padStart(3)} documenti`);
    console.log('  si cancellano (copie):');
    for (const r of daCancellare) console.log(`    ${String(r._id).padEnd(24)} ${String(r.n).padStart(3)} documenti`);
    const totaleDaCancellare = daCancellare.reduce((s, r) => s + r.n, 0);
    console.log(`  totale copie da cancellare: ${totaleDaCancellare}`);

    // ── 2. Profili vecchi dentro l'account ──────────────────────────────────────────
    const documentiAccount = await account.find({}, { projection: { uuid: 1, profiles: 1, activeProfileId: 1 } }).toArray();
    const pianiProfili = [];
    for (const doc of documentiAccount) {
        const profili = Array.isArray(doc.profiles) ? doc.profiles : [];
        const tenuti = profili.filter(p => profiloDaTenere(p?.id));
        const rimossi = profili.filter(p => p && !profiloDaTenere(p.id));
        if (rimossi.length === 0) continue;
        pianiProfili.push({
            uuid: doc.uuid,
            rimossi: rimossi.map(p => ({ id: p.id, nome: p.name || p.nome || null })),
            tenuti: tenuti.map(p => p.id),
            activeProfileId: doc.activeProfileId
        });
    }
    console.log('\nprofili dell\'account:');
    for (const piano of pianiProfili) {
        console.log(`  ${piano.uuid}`);
        console.log(`    tiene:  ${piano.tenuti.join(', ')}`);
        console.log(`    toglie: ${piano.rimossi.map(p => `${p.id}${p.nome ? ` (${p.nome})` : ''}`).join(', ') || '—'}`);
        if (piano.rimossi.some(p => p.id === piano.activeProfileId)) {
            console.log(`    ATTENZIONE: il profilo attivo ${piano.activeProfileId} sarebbe rimosso.`);
        }
    }
    if (pianiProfili.length === 0) console.log('  nessun profilo da rimuovere');

    if (!conferma) {
        console.log('\nPROVA. Non è stato scritto niente. Rilancia con --conferma per applicare.');
        await mongoose.disconnect();
        return;
    }

    // ── Applica ─────────────────────────────────────────────────────────────────────
    let cancellati = 0;
    for (const r of daCancellare) {
        const esito = await cronologia.deleteMany({ context: r._id });
        cancellati += esito.deletedCount || 0;
    }
    console.log(`\ncronologia: ${cancellati} documenti di copia cancellati.`);

    let accountAggiornati = 0;
    for (const piano of pianiProfili) {
        const doc = documentiAccount.find(d => d.uuid === piano.uuid);
        const profili = Array.isArray(doc?.profiles) ? doc.profiles : [];
        const tenuti = profili.filter(p => profiloDaTenere(p?.id));
        await account.updateOne({ uuid: piano.uuid }, { $set: { profiles: tenuti } });
        accountAggiornati += 1;
    }
    console.log(`account: ${accountAggiornati} documenti ripuliti dai profili vecchi.`);

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('Errore durante la pulizia:', err.message);
    try { await mongoose.disconnect(); } catch (_e) { /* niente */ }
    process.exit(1);
});
