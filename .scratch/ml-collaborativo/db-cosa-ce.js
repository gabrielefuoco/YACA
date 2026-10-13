/** db-cosa-ce.js — COSA C'E' DAVVERO NEL DB DI YACA.
 *  Prima di proporre "cerchiamo altri dati" bisogna sapere quali dati esistono gia'.
 *  Elenca tutte le collezioni con il numero di documenti, e per le piu' interessanti
 *  mostra la forma di un documento. */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { connectMongo } = require('C:/Users/gabri/APP/YACA/src/utils/mongoConnect');

(async () => {
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const db = mongoose.connection.db;
    const cols = await db.listCollections().toArray();
    const righe = [];
    for (const c of cols) {
        let n = 0;
        try { n = await db.collection(c.name).estimatedDocumentCount(); } catch (e) { n = -1; }
        righe.push([c.name, n]);
    }
    righe.sort((a, b) => b[1] - a[1]);
    console.log(`collezioni: ${righe.length}`);
    console.log('');
    console.log('  documenti  collezione');
    for (const [nome, n] of righe) console.log(`  ${String(n).padStart(9)}  ${nome}`);

    // forma dei documenti per le collezioni non vuote che sembrano comportamentali
    const occhio = righe.filter(([nome, n]) => n > 0).map(([nome]) => nome);
    console.log('');
    for (const nome of occhio) {
        try {
            const d = await db.collection(nome).findOne({});
            if (!d) continue;
            const chiavi = Object.keys(d).slice(0, 14);
            console.log(`  ${nome}: ${chiavi.join(', ')}`);
        } catch (e) { }
    }
    await mongoose.disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
