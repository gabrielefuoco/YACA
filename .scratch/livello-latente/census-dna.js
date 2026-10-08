/**
 * .scratch/livello-latente/census-dna.js
 *
 * Censimento (SOLA LETTURA) dei vettori DNA salvati: quante chiavi porta ogni
 * profilo, per forma. Serve a misurare se il fix id<->nome è arrivato nei
 * documenti reali, prima e dopo la ricostruzione.
 *
 * Uso: node .scratch/livello-latente/census-dna.js <out.json|-->
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const { connectMongo } = require('../../src/utils/mongoConnect');

const OUT = process.argv[2] && process.argv[2] !== '--' ? process.argv[2] : null;

function breakdown(vector) {
    const keys = Object.keys(vector || {});
    const out = { total: keys.length, g: 0, o: 0, kNum: 0, kNamed: 0, kOther: 0, levels: 0, people: 0 };
    for (const key of keys) {
        if (key.startsWith('g:')) out.g += 1;
        else if (key.startsWith('o:')) out.o += 1;
        else if (key.startsWith('k:')) {
            const rest = key.slice(2);
            if (/^\d+$/.test(rest)) out.kNum += 1;
            else if (rest.trim().length > 0) out.kNamed += 1;
            else out.kOther += 1;
        } else if (/^L[1-5]:/.test(key)) out.levels += 1;
        else if (/^[ad]:/.test(key)) out.people += 1;
    }
    const sum = Object.values(vector || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);
    out.sum = Number(sum.toFixed(2));
    return out;
}

(async () => {
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const db = mongoose.connection.db;

    const profiles = await db.collection('tasteprofiles')
        .find({})
        .project({
            owner: 1, context: 1, lastUpdated: 1,
            'compiledVectors.V_final': 1, 'compiledVectors.V_active': 1, 'compiledVectors.V_static': 1,
            'compiledVectors.V_clusters': 1, 'compiledVectors.lastComputed': 1,
            flatnessMetrics: 1
        })
        .toArray();

    const rows = [];
    for (const p of profiles) {
        const cv = p.compiledVectors || {};
        const interactions = await db.collection('watchhistories')
            .countDocuments({ owner: p.owner, context: p.context });

        rows.push({
            owner: p.owner,
            context: p.context,
            interactions,
            lastComputed: cv.lastComputed || null,
            lastUpdated: p.lastUpdated || null,
            clusters: Array.isArray(cv.V_clusters) ? cv.V_clusters.length : 0,
            final: breakdown(cv.V_final),
            active: breakdown(cv.V_active),
            static: breakdown(cv.V_static),
            flatness: p.flatnessMetrics ? {
                dimensions: p.flatnessMetrics.dimensions,
                entropyBits: p.flatnessMetrics.entropyBits,
                top10Share: p.flatnessMetrics.top10Share
            } : null
        });
    }

    const report = { when: new Date().toISOString(), profiles: rows.length, rows };
    if (OUT) {
        fs.writeFileSync(path.resolve(OUT), JSON.stringify(report, null, 2));
    } else {
        console.log(JSON.stringify(report, null, 2).slice(0, 4000));
    }

    const tot = (sel) => rows.reduce((a, r) => a + sel(r), 0);
    console.log(`\n== CENSIMENTO DNA — ${rows.length} profili ==`);
    console.log(`Chiavi V_final: g ${tot(r => r.final.g)} · k numeriche ${tot(r => r.final.kNum)} · k a nome ${tot(r => r.final.kNamed)} · livelli L1-L5 ${tot(r => r.final.levels)} · o ${tot(r => r.final.o)}`);
    console.log(`Stessa cosa in V_active: k numeriche ${tot(r => r.active.kNum)} · k a nome ${tot(r => r.active.kNamed)} · livelli ${tot(r => r.active.levels)}`);
    console.log(`V_static: k numeriche ${tot(r => r.static.kNum)} · k a nome ${tot(r => r.static.kNamed)} · livelli ${tot(r => r.static.levels)}`);
    console.log(`\n| profilo | interazioni | V_final | k:num | k:nome | livelli | cluster |`);
    console.log(`|---|---|---|---|---|---|---|`);
    for (const r of rows) {
        console.log(`| ${r.owner}/${r.context} | ${r.interactions} | ${r.final.total} | ${r.final.kNum} | ${r.final.kNamed} | ${r.final.levels} | ${r.clusters} |`);
    }

    await mongoose.disconnect();
})().catch(async (err) => {
    console.error('ERRORE censimento:', err.message);
    process.exit(1);
});
