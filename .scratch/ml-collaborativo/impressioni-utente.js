/** impressioni-utente.js — COSA DICONO LE IMPRESSIONI SULL'UNICO UTENTE VERO.
 *  Non si addestra niente: si guarda se il servito assomiglia al guardato.
 *   1. dei 100 titoli GUARDATI, quanti erano stati SERVITI?
 *   2. il catalogo si rinnova o ripropone sempre gli stessi?
 *   3. l'utente guarda quello che gli viene proposto, o va per conto suo?
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { connectMongo } = require('C:/Users/gabri/APP/YACA/src/utils/mongoConnect');
const OWNER = 'REOZrGNRr3';

const k = (t, id) => `${t}:${id}`;

(async () => {
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const db = mongoose.connection.db;
    const I = db.collection('recommendationimpressions');
    const W = db.collection('watchhistories');
    const L = db.collection('userlibraryitems');

    const imp = await I.find({ owner: OWNER }).toArray();
    const wat = await W.find({ owner: OWNER }).toArray();
    const lib = await L.find({}).toArray();

    const serviti = new Map();
    for (const d of imp) {
        const id = k(d.catalogId.includes('series') ? 'tv' : 'movie', d.tmdbId);
        if (!serviti.has(id)) serviti.set(id, { cataloghi: new Set(), date: new Set() });
        const v = serviti.get(id);
        v.cataloghi.add(d.catalogId);
        for (const g of (d.seenDates || [])) v.date.add(g);
    }
    console.log(`IMPRESSIONI: ${imp.length} righe · ${serviti.size} TITOLI distinti serviti`);
    const coperture = [...serviti.values()].map(v => v.date.size).sort((a, b) => a - b);
    console.log(`  giorni di presenza in catalogo per titolo: mediana ${coperture[Math.floor(coperture.length / 2)]} · ` +
        `min ${coperture[0]} · max ${coperture[coperture.length - 1]}`);

    console.log('');
    console.log(`CRONOLOGIA dell'utente: ${wat.length} titoli`);
    let dentro = 0, dentroDopo = 0;
    const esempi = [];
    for (const w of wat) {
        const id = k(w.type, w.tmdbId);
        const s = serviti.get(id);
        if (!s) continue;
        dentro++;
        const quando = w.signals && w.signals[0] ? String(w.signals[0].at).slice(0, 10) : null;
        const presentePrima = quando && [...s.date].some(d => d < quando);
        if (presentePrima) { dentroDopo++; if (esempi.length < 8) esempi.push([id, quando, s.date.size]); }
    }
    console.log(`  guardati che erano STATI SERVITI (almeno una volta): ${dentro}/${wat.length} (${(100 * dentro / wat.length).toFixed(0)}%)`);
    console.log(`  guardati che erano in catalogo PRIMA della visione: ${dentroDopo}/${wat.length} (${(100 * dentroDopo / wat.length).toFixed(0)}%)`);
    console.log('  esempi (titolo · data visione · giorni di presenza):');
    for (const [id, q, n] of esempi) console.log(`    ${id.padEnd(18)} ${q} · ${n} giorni`);

    console.log('');
    console.log(`LIBRERIA: ${lib.length} item · ${lib.filter(x => !x.removed).length} attivi`);
    let inLib = 0, inLibServ = 0;
    for (const l of lib.filter(x => !x.removed)) {
        const id = k(l.type || (l.name && l.name.series ? 'tv' : 'movie'), l.tmdbId || l.id);
        inLib++;
        if ([...serviti.keys()].some(x => x.endsWith(':' + (l.tmdbId || l.id)))) inLibServ++;
    }
    console.log(`  item attivi che erano stati serviti: ${inLibServ}/${inLib}`);

    // rinnovo: quanti titoli NUOVI al giorno
    console.log('');
    console.log('RINNOVO DEL CATALOGO — titoli nuovi al giorno (primi giorni con attivita\')');
    const perGiorno = new Map();
    for (const [id, v] of serviti) {
        const min = [...v.date].sort()[0];
        if (!perGiorno.has(min)) perGiorno.set(min, 0);
        perGiorno.set(min, perGiorno.get(min) + 1);
    }
    const giorni = [...perGiorno.entries()].sort();
    console.log(`  giorni distinti con servizio: ${giorni.length}`);
    for (const [g, n] of giorni.slice(0, 14)) console.log(`    ${g}: ${n} titoli nuovi`);
    await mongoose.disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
