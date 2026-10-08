/**
 * .scratch/ocean-prototipo/analyze-serviti.js   —  PROTOTIPO (strumento di misura)
 *
 * I DUE TEST CHIESTI, sulle liste VERAMENTE SERVITE (run dir dell'harness):
 *
 *  a) NITIDEZZA DELLA CIMA — la lista «sceglie» o prende il mezzo del mucchio?
 *     Per ogni catalogo servito si ricalcola il punteggio di ogni titolo con lo
 *     stesso codice dello scorer e lo si colloca nella distribuzione di un pool
 *     ampio (3.000 film + 1.500 serie). Misure:
 *       - percentile mediano degli item serviti (più alto = più la lista sta in cima)
 *       - percentile dell'ULTIMO item (quanto «cade in basso» la coda della lista)
 *       - quota della lista nel top 5% del pool
 *
 *  b) PONTE FILM↔SERIE — il catalogo serie continua i temi di quello film?
 *     Si prendono i 3 topoi L2 dominanti della lista FILM e si misura quanta parte
 *     della lista SERIE li condivide (e viceversa).
 *
 * Uso: node .scratch/ocean-prototipo/analyze-serviti.js <runDir> [out.json]
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const duckdb = require('duckdb');
const ocean = require('./ocean-core.js');
const graph = require('../../src/engines/graph/HierarchicalGraph');
const ProfileScorer = require('../../src/profile/ProfileScorer.js');
const { connectMongo } = require('../../src/utils/mongoConnect');

const RUN_DIR = process.argv[2];
const OUT = process.argv[3] || null;
const PARQUET_DIR = path.join(__dirname, '../../.cache/tmdb').split(String.fromCharCode(92)).join('/');
const POOL = { movie: 3000, tv: 1500 };
const KIDS = new Set([16, 10751, 10762]);

const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));

const mediaTypeOf = catalogId => (catalogId.includes('_series') || catalogId.includes('series')) ? 'tv' : 'movie';

(async () => {
    if (!RUN_DIR) { console.error('Uso: node analyze-serviti.js <runDir> [out.json]'); process.exit(1); }
    await require('../livello-latente/bootstrap-map.js')();
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const dbm = mongoose.connection.db;

    // --- 1. le liste servite ---
    const rawDir = path.join(RUN_DIR, 'raw');
    const profiles = fs.readdirSync(rawDir).filter(d => fs.statSync(path.join(rawDir, d)).isDirectory());
    const served = [];       // {profile, catalogId, ids:[]}
    for (const p of profiles) {
        for (const file of fs.readdirSync(path.join(rawDir, p)).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
            const data = JSON.parse(fs.readFileSync(path.join(rawDir, p, file), 'utf8'));
            const ids = [];
            for (const page of data.rawPages || []) {
                for (const meta of page?.data?.metas || []) {
                    const rawId = String(meta.id || '').replace(/^tmdb:/, '');
                    if (/^\d+$/.test(rawId)) ids.push(Number(rawId));
                }
            }
            const catalogId = file.replace(/-(movie|series|tv)\.json$/, '');
            if (ids.length > 0) served.push({ profile: p, catalogId, type: mediaTypeOf(catalogId), ids: [...new Set(ids)] });
        }
    }
    const dnaByProfile = new Map();
    for (const p of profiles) {
        const doc = await dbm.collection('tasteprofiles').findOne({ owner: 'sim_user_yaca', context: p });
        dnaByProfile.set(p, doc?.compiledVectors?.V_final || {});
    }

    // --- 2. metadati: item serviti + pool di riferimento ---
    const servedIds = { movie: new Set(), tv: new Set() };
    for (const s of served) for (const id of s.ids) servedIds[s.type].add(id);
    const db = new duckdb.Database(':memory:');
    const loadRows = async (table, cols, limit, extraIds) => {
        const rows = await all(db, `SELECT ${cols} FROM read_parquet('${PARQUET_DIR}/${table}.parquet') ORDER BY popularity DESC LIMIT ${limit}`);
        const ids = [...extraIds].filter(id => !rows.some(r => Number(r.id) === id));
        const chunks = [];
        for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500).join(','));
        for (const list of chunks) {
            rows.push(...await all(db, `SELECT ${cols} FROM read_parquet('${PARQUET_DIR}/${table}.parquet') WHERE id IN (${list})`));
        }
        return rows;
    };
    const movieRows = await loadRows('movies', 'id, title AS name, genres, keywords, runtime, release_date, popularity', POOL.movie, servedIds.movie);
    const tvRows = await loadRows('tv', 'id, name, genres, keywords, first_air_date AS release_date, popularity', POOL.tv, servedIds.tv);
    const toItem = (r, type) => ({
        id: Number(r.id), type, name: r.name,
        genres: parse(r.genres) || [], keywords: parse(r.keywords) || [],
        year: Number(String(r.release_date || '').slice(0, 4)) || null,
        popularity: Number(r.popularity) || 0
    });
    const items = new Map();
    for (const r of movieRows) items.set(`movie:${Number(r.id)}`, toItem(r, 'movie'));
    for (const r of tvRows) items.set(`tv:${Number(r.id)}`, toItem(r, 'tv'));
    for (const item of items.values()) {
        item.genreIds = item.genres.map(g => Number(g.id ?? g));
        item.hVector = graph.vectorizeKeywords(ocean.keywordsOf(item));
        item.l2 = Object.keys(item.hVector).filter(k => k.startsWith('L2:')).sort((a, b) => item.hVector[b] - item.hVector[a]);
    }

    const scoreOf = (vector, item) => ProfileScorer._computeThematicScoreForVector(vector, item.genreIds, item.hVector);
    const poolByType = { movie: [], tv: [] };
    for (const item of items.values()) poolByType[item.type].push(item);
    const poolScores = new Map();   // profile -> type -> sorted scores
    for (const [profile, vector] of dnaByProfile) {
        poolScores.set(profile, {});
        for (const type of ['movie', 'tv']) {
            const sc = poolByType[type].slice(0, POOL[type]).map(i => scoreOf(vector, i)).sort((a, b) => a - b);
            poolScores.get(profile)[type] = sc;
        }
    }
    const percentile = (sorted, value) => {
        if (!sorted.length) return 0;
        let lo = 0, hi = sorted.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < value) lo = mid + 1; else hi = mid; }
        return lo / sorted.length;
    };

    // --- 3. misura (a): nitidezza ---
    const rows = [];
    for (const s of served) {
        const records = s.ids.map(id => items.get(`${s.type}:${id}`)).filter(Boolean);
        if (!records.length) continue;
        const vector = dnaByProfile.get(s.profile);
        const scores = records.map(i => scoreOf(vector, i));
        const sorted = poolScores.get(s.profile)[s.type];
        const pcts = scores.map(v => percentile(sorted, v));
        const top5 = pcts.filter(p => p >= 0.95).length;
        rows.push({
            profile: s.profile, catalogId: s.catalogId, type: s.type, n: records.length,
            pctMedian: median(pcts), pctLast: pcts[pcts.length - 1], pctTop: Math.max(...pcts),
            shareTop5: top5 / records.length,
            kids: records.filter(i => i.genreIds.some(g => KIDS.has(g))).length / records.length,
            scoreSpread: (Math.max(...scores) - Math.min(...scores)) / (median(scores) || 1)
        });
    }

    console.log(`\n================ (a) NITIDEZZA DELLA CIMA — run ${path.basename(RUN_DIR)} ================\n`);
    console.log('| profilo | catalogo | item | percentile mediano | percentile ultimo | nel top 5% del pool | quota bambini/animazione |');
    console.log('|---|---|---|---|---|---|---|');
    for (const r of rows.sort((a, b) => a.profile.localeCompare(b.profile) || a.catalogId.localeCompare(b.catalogId))) {
        console.log(`| ${r.profile.replace('sim_prof_ocean_', '')} | ${r.catalogId.replace('yaca_', '')} | ${r.n}`
            + ` | ${(100 * r.pctMedian).toFixed(0)}% | ${(100 * r.pctLast).toFixed(0)}% | ${(100 * r.shareTop5).toFixed(0)}% | ${(100 * r.kids).toFixed(0)}% |`);
    }
    console.log(`\nmedie: percentile mediano ${(100 * mean(rows.map(r => r.pctMedian))).toFixed(0)}% · ultimo ${(100 * mean(rows.map(r => r.pctLast))).toFixed(0)}%`
        + ` · nel top 5% ${(100 * mean(rows.map(r => r.shareTop5))).toFixed(0)}% · bambini/animazione ${(100 * mean(rows.map(r => r.kids))).toFixed(0)}%`);
    console.log('(caso casuale: percentile mediano 50%, ultimo 50%, nel top 5% 5%)');

    // --- 4. misura (b): ponte film ↔ serie ---
    const hasPair = ids => ids.some(i => i.endsWith('_movies')) && ids.some(i => i.endsWith('_series'));
    const crossRows = [];
    // Baseline: quanto condividerebbe una lista PRESA A CASO dal pool della stessa dimensione.
    let rndState = 20261008;
    const rnd = () => { rndState = (rndState * 1103515245 + 12345) % 2147483648; return rndState / 2147483648; };
    const randomShareFor = (themes, type, size) => {
        const pool = poolByType[type].slice(0, POOL[type]);
        let sum = 0;
        for (let draw = 0; draw < 60; draw++) {
            let hits = 0;
            for (let i = 0; i < size; i++) {
                const item = pool[Math.floor(rnd() * pool.length)];
                if (item.l2.some(l2 => themes.includes(l2))) hits += 1;
            }
            sum += hits / size;
        }
        return sum / 60;
    };
    for (const p of [...new Set(rows.map(r => r.profile))]) {
        const mine = served.filter(s => s.profile === p);
        const pairs = [['true_blend', 'yaca_true_blend_movies', 'yaca_true_blend_series'], ['hidden_gems', 'yaca_hidden_gems_movies', 'yaca_hidden_gems_series']];
        for (const [label, movieCat, seriesCat] of pairs) {
            const mv = mine.find(s => s.catalogId === movieCat);
            const sr = mine.find(s => s.catalogId === seriesCat);
            if (!mv || !sr) continue;
            const themesOf = list => {
                const count = new Map();
                for (const id of list.ids) {
                    const item = items.get(`${list.type}:${id}`);
                    if (!item) continue;
                    for (const l2 of item.l2.slice(0, 2)) count.set(l2, (count.get(l2) || 0) + 1);
                }
                return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
            };
            const share = (list, themes) => {
                const hits = list.ids.filter(id => {
                    const item = items.get(`${list.type}:${id}`);
                    return item && item.l2.some(l2 => themes.includes(l2));
                }).length;
                return { share: hits / list.ids.length, themes };
            };
            const forward = share(sr, themesOf(mv));
            const backward = share(mv, themesOf(sr));
            crossRows.push({ profile: p, kind: label, forward: forward.share, backward: backward.share, movieThemes: forward.themes, seriesThemes: backward.themes,
                forwardBaseline: randomShareFor(forward.themes, 'tv', sr.ids.length),
                backwardBaseline: randomShareFor(backward.themes, 'movie', mv.ids.length) });
        }
    }
    console.log('\n================ (b) PONTE FILM ↔ SERIE (topoi L2 condivisi) ================\n');
    console.log('| profilo | catalogo | serie che riprendono i temi dei film (caso: X%) | film che riprendono i temi delle serie (caso: Y%) |');
    console.log('|---|---|---|---|');
    for (const r of crossRows) {
        console.log(`| ${r.profile.replace('sim_prof_ocean_', '')} | ${r.kind} | ${(100 * r.forward).toFixed(0)}% (${(100 * r.forwardBaseline).toFixed(0)}%) | ${(100 * r.backward).toFixed(0)}% (${(100 * r.backwardBaseline).toFixed(0)}%) |`);
    }
    if (crossRows.length) {
        console.log(`\nmedia: film→serie ${(100 * mean(crossRows.map(r => r.forward))).toFixed(0)}% (caso ${(100 * mean(crossRows.map(r => r.forwardBaseline))).toFixed(0)}%)`
            + ` · serie→film ${(100 * mean(crossRows.map(r => r.backward))).toFixed(0)}% (caso ${(100 * mean(crossRows.map(r => r.backwardBaseline))).toFixed(0)}%)`);
    }

    if (OUT) {
        fs.writeFileSync(path.resolve(OUT), JSON.stringify({ runDir: RUN_DIR, when: new Date().toISOString(), sharpness: rows, crossMedia: crossRows }, null, 2));
        console.log(`\nscritto: ${OUT}`);
    }
    await mongoose.disconnect();
})().catch(err => { console.error('ERRORE:', err.message); process.exit(1); });
