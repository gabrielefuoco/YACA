/**
 * .scratch/livello-latente/check-map-coverage.js
 *
 * PREDIZIONE della ricostruzione: le keyword a numero salvate nei profili reali,
 * quante la mappa del dump saprà risolvere in nome (e quindi portare in `k:<nome>`
 * + livelli L1-L5)?
 *
 * Le chiavi che restano solo numeriche non potranno MAI incontrare l'item, che è
 * etichettato a nome: sono peso morto nel vettore.
 *
 * Uso: node .scratch/livello-latente/check-map-coverage.js <census.json>
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const { connectMongo } = require('../../src/utils/mongoConnect');

const CENSUS = process.argv[2] || path.join(__dirname, 'runs', 'census-prima.json');

(async () => {
    await require('./bootstrap-map.js')();
    const { getKeywordNameMaps } = require('../../src/data/keywordIds');
    const { idToName } = getKeywordNameMaps();

    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const db = mongoose.connection.db;
    const profiles = await db.collection('tasteprofiles')
        .find({}).project({ owner: 1, context: 1, 'compiledVectors.V_final': 1, 'compiledVectors.V_active': 1, 'compiledVectors.V_static': 1 })
        .toArray();

    const all = new Map();   // id -> {profiles:Set}
    const perProfile = [];
    for (const p of profiles) {
        const cv = p.compiledVectors || {};
        const ids = new Set();
        for (const vector of [cv.V_final, cv.V_active, cv.V_static]) {
            for (const key of Object.keys(vector || {})) {
                if (/^k:\d+$/.test(key)) {
                    const id = key.slice(2);
                    ids.add(id);
                    if (!all.has(id)) all.set(id, new Set());
                    all.get(id).add(`${p.owner}/${p.context}`);
                }
            }
        }
        const resolved = [...ids].filter(id => idToName.has(id));
        perProfile.push({
            profile: `${p.owner}/${p.context}`,
            idsDistinti: ids.size,
            risolvibili: resolved.length,
            orfane: ids.size - resolved.length,
            esempiOrfane: [...ids].filter(id => !idToName.has(id)).slice(0, 5)
        });
    }

    console.log('\n== COPERTURA DELLA MAPPA SULLE KEYWORD DEI PROFILI REALI ==\n');
    console.log(`mappa dal dump: ${idToName.size} keyword`);
    console.log(`\n| profilo | keyword distinte | risolvibili | orfane (restano numeriche) | copertura |`);
    console.log(`|---|---|---|---|---|`);
    for (const r of perProfile) {
        console.log(`| ${r.profile} | ${r.idsDistinti} | ${r.risolvibili} | ${r.orfane} | ${(100 * r.risolvibili / r.idsDistinti).toFixed(1)}% |`);
    }

    const totali = all.size;
    const risolvibili = [...all.keys()].filter(id => idToName.has(id)).length;
    console.log(`\nUnione dei 5 profili: ${totali} keyword distinte, ${risolvibili} risolvibili (${(100 * risolvibili / totali).toFixed(1)}%), ${totali - risolvibili} orfane.`);
    const orphanProfiles = new Map();
    for (const [id, owners] of all) {
        if (idToName.has(id)) continue;
        for (const o of owners) orphanProfiles.set(o, (orphanProfiles.get(o) || 0) + 1);
    }
    console.log('Orfane per profilo:', [...orphanProfiles.entries()].map(([k, v]) => `${k}:${v}`).join(' · ') || 'nessuna');
    console.log('Esempi di orfane:', [...all.keys()].filter(id => !idToName.has(id)).slice(0, 8).join(', '));

    await mongoose.disconnect();
})().catch(err => { console.error('ERRORE:', err.message); process.exit(1); });
