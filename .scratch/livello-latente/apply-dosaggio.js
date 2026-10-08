/**
 * .scratch/livello-latente/apply-dosaggio.js   —  SOLO SU PROFILI DI TEST (sim_user_yaca)
 *
 * Riscrive `V_final` dei profili `sim_*` con un dosaggio diverso fra metà dichiarata
 * e comportamentale, per poterlo confrontare sulle liste servite SENZA toccare né il
 * codice di produzione né i profili reali.
 *
 * Uso: node .scratch/livello-latente/apply-dosaggio.js [T+15|originale]
 *      T+15      → curva candidata A: w = 0,85·T/(T+15)
 *      originale → curva di produzione: w = 0,85·T/(T+50)
 */
const mongoose = require('mongoose');
require('dotenv').config();
const dna = require('../../src/dna/dnaEngine.js');
const { connectMongo } = require('../../src/utils/mongoConnect');

const CURVE = (process.argv[2] || 'T+15') === 'originale' ? 50 : 15;
const OWNER = 'sim_user_yaca';

function fuse(vStatic, vActive, wActive) {
    const s = dna.normalizeVector(dna.applySoftRarity(vStatic || {}));
    const a = dna.normalizeVector(dna.applySoftRarity(vActive || {}));
    const hasS = Object.keys(s).length > 0;
    const hasA = Object.keys(a).length > 0;
    if (hasS && !hasA) wActive = 0;
    if (!hasS && hasA) wActive = 1;
    const out = {};
    for (const key of new Set([...Object.keys(s), ...Object.keys(a)])) {
        out[key] = ((s[key] || 0) * (1 - wActive) + (a[key] || 0) * wActive) * 100;
    }
    const sum = Object.values(out).reduce((x, y) => x + y, 0);
    if (sum > 0) for (const k of Object.keys(out)) out[k] = out[k] * (100 / sum);
    return out;
}

(async () => {
    await require('./bootstrap-map.js')();
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const db = mongoose.connection.db;

    const docs = await db.collection('tasteprofiles').find({ owner: OWNER }).toArray();
    console.log(`curva: w = 0,85·T/(T+${CURVE})  ·  profili di test: ${docs.length}`);
    for (const doc of docs) {
        const cv = doc.compiledVectors || {};
        const historyDocs = await db.collection('watchhistories').find({ owner: OWNER, context: doc.context }).toArray();
        const T = dna.calculateWeightedInteractions(historyDocs);
        const wActive = (0.85 * T) / (T + CURVE);
        const vFinal = fuse(cv.V_static, cv.V_active, wActive);
        await db.collection('tasteprofiles').updateOne(
            { _id: doc._id },
            { $set: { 'compiledVectors.V_final': vFinal, 'compiledVectors.doseApplied': { curve: `T+${CURVE}`, T, wActive: Number(wActive.toFixed(4)) } } }
        );
        console.log(`  ${doc.context.padEnd(26)} T=${String(T).padStart(3)} → peso comportamentale ${(100 * wActive).toFixed(0)}% · V_final ${Object.keys(vFinal).length} chiavi`);
    }
    await mongoose.disconnect();
})().catch(err => { console.error('ERRORE:', err.message); process.exit(1); });
