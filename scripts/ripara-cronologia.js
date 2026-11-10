#!/usr/bin/env node
/**
 * Ripara la cronologia di visione corrotta dall'ingestione di Stremio.
 *
 * IL DANNO. `ProfileBuilder.syncStremioData` faceva due cose sbagliate a ogni
 * sincronizzazione:
 *
 *   1. `$inc: { episodesWatched: 1 }` — il numero di visioni cresceva di uno **per
 *      sync**, non per visione. Dopo N sincronizzazioni un titolo risultava visto N
 *      volte: nel database ci sono documenti con 30360 «visioni».
 *   2. `lastWatchedAt: new Date()` quando la sorgente non dichiarava una data — cioè
 *      quasi sempre per gli item di libreria. Risultato: titoli «visti oggi» che non
 *      sono stati visti oggi, e la data si spostava avanti a ogni sync.
 *
 * Il codice è stato corretto (niente `$inc`, niente date inventate). Questo script
 * ripara i documenti già scritti.
 *
 * COME RICONOSCE L'ORIGINE DEL DANNO. Un `at` di segnale condiviso da molti documenti
 * allo stesso millisecondo non è una visione: è il timestamp del ciclo di sync. Quei
 * segnali si scartano; le date singole restano perché sono informazioni vere.
 *
 * USO
 *   node scripts/ripara-cronologia.js            → prova, non scrive niente
 *   node scripts/ripara-cronologia.js --conferma → applica
 *
 * Tocca solo `watchhistories`. Non tocca la libreria, i cataloghi né il grafo.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const SOGLIA_CONDIVISIONE = 5; // un `at` condiviso da >= 5 documenti è un ciclo di sync
const TOLLERANZA_SCRITTURA_MS = 5000; // `at` a meno di 5s dalla scrittura del documento
const CHIAVE_DATA = (at) => (at ? new Date(at).toISOString() : null);

/**
 * Il segnale è stato scritto con `new Date()` al posto della data vera.
 *
 * Due firme, entrambe sul solo Stremio (Trakt porta la data dell'episodio):
 *  - l'`at` coincide con l'istante in cui il documento è stato scritto (±5s);
 *  - l'`at` è condiviso da molti documenti, cioè è il timestamp del ciclo di sync.
 */
function segnaleInventato(segnale, doc, dateSospette) {
    if (!segnale?.at || segnale.source !== 'stremio') return false;
    if (dateSospette.has(CHIAVE_DATA(segnale.at))) return true;
    if (!doc.updatedAt) return false;
    return Math.abs(new Date(segnale.at).getTime() - new Date(doc.updatedAt).getTime()) <= TOLLERANZA_SCRITTURA_MS;
}

async function main() {
    const conferma = process.argv.includes('--conferma');
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI assente: impossibile procedere.');
        process.exit(1);
    }

    await mongoose.connect(uri);
    const cronologia = mongoose.connection.db.collection('watchhistories');

    const documenti = await cronologia.find({}).toArray();
    console.log(`documenti in cronologia: ${documenti.length}`);

    // 1. Quali date di segnale sono un artefatto del sync?
    //
    // Solo i segnali di Stremio possono esserlo: Trakt porta la data dell'episodio, e
    // scartarla perché capita lo stesso millisecondo su più titoli (un import in blocco)
    // sarebbe buttare informazione vera. La regola guarda quindi la SORGENTE, non solo
    // la ripetizione.
    const contatoreDate = new Map();
    for (const doc of documenti) {
        for (const segnale of Array.isArray(doc.signals) ? doc.signals : []) {
            if (!segnale?.at || segnale.source !== 'stremio') continue;
            const chiave = CHIAVE_DATA(segnale.at);
            contatoreDate.set(chiave, (contatoreDate.get(chiave) || 0) + 1);
        }
    }
    const dateSospette = new Set(
        [...contatoreDate.entries()].filter(([, n]) => n >= SOGLIA_CONDIVISIONE).map(([data]) => data)
    );
    console.log(`date di segnale condivise da >= ${SOGLIA_CONDIVISIONE} documenti (artefatti del sync): ${dateSospette.size}`);

    // 2. Piano di riparazione, documento per documento
    const piano = [];
    for (const doc of documenti) {
        const segnali = Array.isArray(doc.signals) ? doc.signals : [];
        // Un segnale con data inventata si toglie del tutto: se restasse senza `at`, i lettori
        // ripiegherebbero su `lastWatchedAt` — che è anch'esso inventato — e l'età tornerebbe.
        const segnaliVeri = segnali.filter(s => !segnaleInventato(s, doc, dateSospette));
        const visioniVere = new Set(
            segnaliVeri.filter(s => s.type === 'watched').map(s => CHIAVE_DATA(s.at))
        ).size;
        const ultimaVisioneVera = segnaliVeri
            .filter(s => s.type === 'watched' && s.at)
            .map(s => new Date(s.at).getTime())
            .sort((a, b) => b - a)[0];

        // Una data è sospetta solo se coincide con un artefatto del sync E l'ultimo
        // segnale viene da Stremio: quella di Trakt non si tocca.
        const ultimoSegnale = segnali.length > 0 ? segnali[segnali.length - 1] : null;
        const lastWatchedAttuale = doc.lastWatchedAt ? new Date(doc.lastWatchedAt) : null;
        // La data del documento è inventata se coincide con la scrittura ed è di Stremio.
        const lastWatchedAtSospetto = lastWatchedAttuale
            ? (ultimoSegnale?.source === 'stremio'
                && Math.abs(lastWatchedAttuale.getTime() - new Date(doc.updatedAt || 0).getTime()) <= TOLLERANZA_SCRITTURA_MS)
            : false;
        const lastWatchedAtNuovo = lastWatchedAtSospetto
            ? (ultimaVisioneVera ? new Date(ultimaVisioneVera) : (doc.createdAt ? new Date(doc.createdAt) : null))
            : lastWatchedAttuale;

        const episodesAttuale = Number(doc.episodesWatched) || 0;
        const episodesNuovo = Math.max(1, visioniVere);

        const cambiaSegnali = segnaliVeri.length !== segnali.length;
        const cambiaEpisodi = episodesAttuale !== episodesNuovo;
        const eliminaData = Boolean(lastWatchedAtSospetto && ultimaVisioneVera === undefined);
        const cambiaData = !eliminaData && lastWatchedAttuale && lastWatchedAtNuovo
            ? lastWatchedAttuale.getTime() !== lastWatchedAtNuovo.getTime()
            : (!eliminaData && lastWatchedAtNuovo !== null && !lastWatchedAttuale);

        if (!cambiaSegnali && !cambiaEpisodi && !cambiaData && !eliminaData) continue;

        piano.push({
            _id: doc._id,
            tmdbId: doc.tmdbId,
            context: doc.context,
            prima: { episodesWatched: episodesAttuale, lastWatchedAt: doc.lastWatchedAt, segnali: segnali.length },
            dopo: { episodesWatched: episodesNuovo, lastWatchedAt: lastWatchedAtNuovo, segnali: segnaliVeri.length },
            aggiornamento: {
                $set: {
                    signals: segnaliVeri,
                    episodesWatched: episodesNuovo,
                    ...(eliminaData || !lastWatchedAtNuovo ? {} : { lastWatchedAt: lastWatchedAtNuovo })
                },
                // Senza una visione vera, la data non si dichiara affatto: l'età resta ignota
                // invece di diventare «oggi».
                ...(eliminaData ? { $unset: { lastWatchedAt: '' } } : {})
            }
        });
    }

    console.log(`documenti da riparare: ${piano.length} / ${documenti.length}`);
    const assurdiPrima = documenti.filter(d => (Number(d.episodesWatched) || 0) > 50).length;
    const assurdiDopo = piano.length
        ? documenti.filter(d => (Number(d.episodesWatched) || 0) > 50 && !piano.some(p => String(p._id) === String(d._id))).length
            + piano.filter(p => p.dopo.episodesWatched > 50).length
        : assurdiPrima;
    console.log(`documenti con più di 50 visioni: ${assurdiPrima} prima, ${assurdiDopo} dopo`);

    const segnaliRimossi = piano.reduce((sum, p) => sum + (p.prima.segnali - p.dopo.segnali), 0);
    const dateEliminate = piano.filter(p => p.aggiornamento.$unset).length;
    console.log(`segnali con data inventata da rimuovere: ${segnaliRimossi}`);
    console.log(`documenti a cui togliere una data falsa («visto oggi»): ${dateEliminate}`);

    const esempi = piano.slice(0, 8);
    for (const p of esempi) {
        console.log(`  ${p.context} · tmdb ${p.tmdbId}: ${p.prima.episodesWatched} visioni → ${p.dopo.episodesWatched}, ` +
            `${p.prima.lastWatchedAt ? new Date(p.prima.lastWatchedAt).toISOString().slice(0, 10) : '—'} → ` +
            `${p.dopo.lastWatchedAt ? new Date(p.dopo.lastWatchedAt).toISOString().slice(0, 10) : '—'}`);
    }
    if (piano.length > esempi.length) console.log(`  … e altri ${piano.length - esempi.length} documenti`);

    if (!conferma) {
        console.log('\nPROVA. Non è stato scritto niente. Rilancia con --conferma per applicare.');
        await mongoose.disconnect();
        return;
    }

    const operazioni = piano.map(p => ({
        updateOne: { filter: { _id: p._id }, update: p.aggiornamento }
    }));
    let applicate = 0;
    for (let i = 0; i < operazioni.length; i += 200) {
        const lotto = operazioni.slice(i, i + 200);
        if (lotto.length === 0) continue;
        const esito = await cronologia.bulkWrite(lotto, { ordered: false });
        applicate += esito.modifiedCount || 0;
    }
    console.log(`\nAPPLICATO: ${applicate} documenti riparati.`);
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('Errore durante la riparazione:', err.message);
    try { await mongoose.disconnect(); } catch (_e) { /* niente */ }
    process.exit(1);
});
