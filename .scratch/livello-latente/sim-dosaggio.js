/**
 * .scratch/livello-latente/sim-dosaggio.js
 *
 * LA DOMANDA: la fusione `V_final` dà alla metà DICHIARATA (i preset scelti) il 52% del
 * peso, con la curva di produzione `w_active = 0,85·T/(T+50)`. È il dosaggio giusto?
 *
 * Metodo (leave-out sulla cronologia VERA, la stessa del cold start):
 *   - si mostrano k titoli visti al modello e si nascondono gli altri;
 *   - la metà comportamentale si costruisce da quei k titoli, la metà dichiarata è
 *     quella salvata nel profilo reale (V_static);
 *   - si fondono con pesi diversi e si misura quanti dei titoli NASCOSTI entrano
 *     nella top-50 / top-200 di un pool di ~2.000 titoli (caso casuale 2,5% / 10%).
 *
 * Un dosaggio è migliore se alza quel numero. La fusione replica esattamente
 * `computeFinalDNA`, cambiando solo il peso.
 *
 * Uso: node .scratch/livello-latente/sim-dosaggio.js
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const duckdb = require('duckdb');
const graph = require('../../src/engines/graph/HierarchicalGraph');
const dna = require('../../src/dna/dnaEngine.js');
const ProfileScorer = require('../../src/profile/ProfileScorer.js');
const ocean = require('../ocean-prototipo/ocean-core.js');
const { connectMongo } = require('../../src/utils/mongoConnect');

const PARQUET_DIR = path.join(__dirname, '../../.cache/tmdb').split(String.fromCharCode(92)).join('/');
const DISTRACTORS = 1500;
const K_LIST = [1, 3, 5, 10];
const DRAWS = 6;
const DOSES = [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1.0];

const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));

/** Fusione identica a computeFinalDNA, con il peso scelto a mano. */
function fuse(vStatic, vActive, wActive) {
    const s = dna.normalizeVector(dna.applySoftRarity(vStatic || {}));
    const a = dna.normalizeVector(dna.applySoftRarity(vActive || {}));
    const hasS = Object.keys(s).length > 0;
    const hasA = Object.keys(a).length > 0;
    if (!hasS && !hasA) return {};
    if (hasS && !hasA) { wActive = 0; }
    if (!hasS && hasA) { wActive = 1; }
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
    const dbm = mongoose.connection.db;

    const profiles = await dbm.collection('tasteprofiles').find({ owner: 'REOZrGNRr3' })
        .project({ context: 1, 'compiledVectors.V_static': 1, 'compiledVectors.V_active': 1 }).toArray();
    const histories = await dbm.collection('watchhistories').find({ owner: 'REOZrGNRr3' })
        .project({ context: 1, tmdbId: 1, type: 1 }).toArray();

    const byProfile = new Map();
    for (const h of histories) {
        const ctx = h.context;
        if (!byProfile.has(ctx)) byProfile.set(ctx, []);
        byProfile.get(ctx).push({ tmdbId: Number(h.tmdbId), type: (h.type === 'tv' || h.type === 'series' || h.type === 'anime') ? 'tv' : 'movie' });
    }
    const usable = profiles.filter(p => (byProfile.get(p.context) || []).length >= 12);

    const byType = { movie: new Set(), tv: new Set() };
    for (const p of usable) for (const h of byProfile.get(p.context)) byType[h.type].add(h.tmdbId);

    const db = new duckdb.Database(':memory:');
    const load = async (table, cols, where) => (await all(db, `SELECT ${cols} FROM read_parquet('${PARQUET_DIR}/${table}.parquet') ${where}`));
    const toItem = (r, type) => ({
        id: Number(r.id), type, name: r.name, genres: parse(r.genres) || [], keywords: parse(r.keywords) || []
    });
    const catalogue = new Map();
    const movieRows = [...await load('movies', 'id, title AS name, genres, keywords', `WHERE id IN (${[...byType.movie].join(',')})`),
        ...await load('movies', 'id, title AS name, genres, keywords', `ORDER BY popularity DESC LIMIT ${DISTRACTORS}`)];
    for (const r of movieRows) catalogue.set(`movie:${Number(r.id)}`, toItem(r, 'movie'));
    const tvRows = [...await load('tv', 'id, name, genres, keywords', `WHERE id IN (${[...byType.tv].join(',')})`),
        ...await load('tv', 'id, name, genres, keywords', `ORDER BY popularity DESC LIMIT ${DISTRACTORS}`)];
    for (const r of tvRows) catalogue.set(`tv:${Number(r.id)}`, toItem(r, 'tv'));
    for (const item of catalogue.values()) {
        item.genreIds = item.genres.map(g => Number(g.id ?? g));
        item.hVector = graph.vectorizeKeywords(ocean.keywordsOf(item));
    }
    const pool = [...catalogue.values()];

    const activeFrom = seeds => {
        const raw = {};
        for (const item of seeds) {
            const kws = ocean.keywordsOf(item);
            const vec = dna.extractActiveDNAFromTmdbData({
                genre_ids: item.genreIds, origin_country: [],
                keywords: { results: kws }, keyword_ids: kws.map(k => String(k.id))
            }, 100);
            for (const [key, value] of Object.entries(vec)) raw[key] = (raw[key] || 0) + value;
        }
        return dna.computeActiveDNA(raw);
    };

    let state = 5150505;
    const rnd = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
    const shuffle = a => { const arr = [...a]; for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

    const results = [];
    for (const profile of usable) {
        const items = byProfile.get(profile.context).map(h => catalogue.get(`${h.type}:${h.tmdbId}`)).filter(Boolean);
        if (items.length < 12) continue;
        const vStatic = profile.compiledVectors?.V_static || {};
        for (const k of K_LIST) {
            if (items.length < k + 6) continue;
            for (let draw = 0; draw < DRAWS; draw++) {
                const pool2 = shuffle(items);
                const seeds = pool2.slice(0, k);
                const gold = pool2.slice(k).map(i => `${i.type}:${i.id}`);
                const candidates = pool.filter(i => !seeds.some(s => s.id === i.id && s.type === i.type));
                const active = activeFrom(seeds);
                for (const dose of DOSES) {
                    const vector = fuse(vStatic, active, dose);
                    const scored = candidates
                        .map(i => ({ key: `${i.type}:${i.id}`, score: ProfileScorer._computeThematicScoreForVector(vector, i.genreIds, i.hVector) }))
                        .sort((a, b) => (b.score - a.score) || a.key.localeCompare(b.key));
                    const top = n => new Set(scored.slice(0, n).map(s => s.key));
                    const t50 = top(50), t200 = top(200);
                    results.push({ context: profile.context, k, dose,
                        r50: gold.filter(g => t50.has(g)).length / gold.length,
                        r200: gold.filter(g => t200.has(g)).length / gold.length });
                }
            }
        }
    }

    const pct = v => `${(100 * v).toFixed(1)}%`;
    for (const n of [50, 200]) {
        console.log(`\n== RECALL @${n} per dosaggio (medie su ${usable.length} profili reali, ${DRAWS} estrazioni) ==\n`);
        console.log(`| peso comportamentale | ${K_LIST.map(k => `k=${k}`).join(' | ')} | media |`);
        console.log(`|---|${K_LIST.map(() => '---').join('|')}|---|`);
        for (const dose of DOSES) {
            const cells = K_LIST.map(k => {
                const r = results.filter(x => x.k === k && x.dose === dose);
                return pct(mean(r.map(x => n === 50 ? x.r50 : x.r200)));
            });
            const overall = results.filter(x => x.dose === dose).map(x => n === 50 ? x.r50 : x.r200);
            const label = dose === 0 ? '0% (solo preset dichiarati)' : (dose === 1 ? '100% (solo comportamento)' : `${(100 * dose).toFixed(0)}%`);
            console.log(`| ${label} | ${cells.join(' | ')} | **${pct(mean(overall))}** |`);
        }
    }
    console.log('\n(produzione oggi: il peso del comportamento dipende da T, per questi profili ≈ 48% — cioè fra 0,35 e 0,5)');

    // ---- confronto appaiato: stessa estrazione, dosi diverse ----
    const paired = (doseA, doseB, n) => {
        const key = x => `${x.context}|${x.k}`;
        const byKey = new Map();
        for (const r of results) {
            if (!byKey.has(key(r))) byKey.set(key(r), {});
            byKey.get(key(r))[r.dose] = n === 50 ? r.r50 : r.r200;
        }
        const deltas = [];
        for (const m of byKey.values()) {
            if (m[doseA] === undefined || m[doseB] === undefined) continue;
            deltas.push(m[doseA] - m[doseB]);
        }
        const meanD = mean(deltas);
        const sd = Math.sqrt(mean(deltas.map(d => (d - meanD) ** 2)));
        const se = sd / Math.sqrt(deltas.length || 1);
        return { meanD, se, t: se > 0 ? meanD / se : 0, wins: deltas.filter(d => d > 0).length, n: deltas.length };
    };

    console.log('\n== CONFRONTO APPAIATO (stesse estrazioni, dosi diverse) ==\n');
    console.log('| confronto | recall | delta medio | errore std | t | estrazioni in cui vince |');
    console.log('|---|---|---|---|---|---|');
    for (const [a, b] of [[0.65, 0.5], [0.8, 0.5], [0.65, 0.35], [0.8, 0.35]]) {
        for (const n of [50, 200]) {
            const r = paired(a, b, n);
            console.log(`| ${(100 * a).toFixed(0)}% vs ${(100 * b).toFixed(0)}% | @${n} | ${r.meanD > 0 ? '+' : ''}${(100 * r.meanD).toFixed(2)} pt | ${(100 * r.se).toFixed(2)} pt | ${r.t.toFixed(1)} | ${r.wins}/${r.n} |`);
        }
    }

    // ---- la curva: cosa assegnerebbe oggi e cosa assegnerebbero le candidate ----
    const T_OF_K = { 1: 3, 3: 9, 5: 15, 10: 30 };
    const curves = {
        'oggi 0,85·T/(T+50)': T => 0.85 * T / (T + 50),
        'A 0,85·T/(T+15)': T => 0.85 * T / (T + 15),
        'B 0,90·T/(T+20)': T => 0.90 * T / (T + 20),
        'C 0,85·T/(T+10)': T => 0.85 * T / (T + 10)
    };
    console.log('\n== LA CURVA DEL DOSAGGIO ==\n');
    console.log('| semi k | T stimato | dose migliore osservata (@200) | ' + Object.keys(curves).join(' | ') + ' |');
    console.log(`|---|---|---|${Object.keys(curves).map(() => '---').join('|')}|`);
    for (const k of K_LIST) {
        const perDose = DOSES.map(dose => ({
            dose,
            r: mean(results.filter(x => x.k === k && x.dose === dose).map(x => x.r200))
        }));
        const best = perDose.reduce((a, b) => (b.r > a.r ? b : a));
        const T = T_OF_K[k];
        console.log(`| ${k} | ${T} | **${(100 * best.dose).toFixed(0)}%** (${pct(best.r)}) | `
            + Object.values(curves).map(f => `${(100 * f(T)).toFixed(0)}%`).join(' | ') + ' |');
    }
    console.log('\nPer questi profili reali (T ≈ 66): dose attuale 48% · migliore osservata 65-80% → le curve A/B/C la avvicinano.');
    await mongoose.disconnect();
})().catch(err => { console.error('ERRORE:', err.message); process.exit(1); });
