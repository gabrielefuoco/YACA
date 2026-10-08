/**
 * .scratch/ml-collaborativo/bench-transfer.js
 *
 * IL BANCO DEFINITIVO del trasferimento film→serie.
 *
 * I punteggi dei modelli appresi (student, controllo popolarità, teacher oracolo)
 * arrivano da Python (`export-student-scores.py`). Il BASELINE lo calcola qui il
 * CODICE DI PRODUZIONE — `extractActiveDNAFromTmdbData` + `computeActiveDNA` +
 * `computeFinalDNA` + `ProfileScorer._computeThematicScoreForVector` — con la
 * gerarchia L1-L5 e la mappa id→nome: è il pezzo che il proxy Python sbagliava.
 *
 * Due setting:
 *   semi_film  = semi SOLO film  → si recuperano le SERIE nascoste (trasferimento puro)
 *   semi_misti = semi misti (realistico) → si recuperano entrambi, separati per tipo
 *
 * Uso: node .scratch/ml-collaborativo/bench-transfer.js
 */
const fs = require('fs');
const path = require('path');
const duckdb = require('duckdb');
const graph = require('../../src/engines/graph/HierarchicalGraph');
const dna = require('../../src/dna/dnaEngine.js');
const ProfileScorer = require('../../src/profile/ProfileScorer.js');
const ocean = require('../ocean-prototipo/ocean-core.js');

const CACHE = path.join(__dirname, '../../.cache/movielens');
const PARQUET_DIR = path.join(__dirname, '../../.cache/tmdb').split(String.fromCharCode(92)).join('/');
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));
const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

(async () => {
    await require('../livello-latente/bootstrap-map.js')();
    const trials = JSON.parse(fs.readFileSync(path.join(CACHE, 'transfer-trials.json'), 'utf8'));
    const histories = JSON.parse(fs.readFileSync(path.join(CACHE, 'histories.json'), 'utf8'));

    // --- metadati di tutti gli item coinvolti ---
    const wanted = { movie: new Set(), tv: new Set() };
    for (const t of trials) {
        for (const [type, id] of [...t.seeds, ...t.candidates]) wanted[type].add(Number(id));
    }
    const db = new duckdb.Database(':memory:');
    const load = async (table, cols, ids, type) => {
        const rows = [];
        const list = [...ids];
        for (let i = 0; i < list.length; i += 400) {
            const chunk = list.slice(i, i + 400);
            rows.push(...await all(db, `SELECT ${cols} FROM read_parquet('${PARQUET_DIR}/${table}.parquet') WHERE id IN (${chunk.join(',')})`));
        }
        return rows.map(r => ({ type, id: Number(r.id), title: r.title, genres: parse(r.genres) || [], keywords: parse(r.keywords) || [] }));
    };
    const items = new Map();
    for (const it of await load('movies', 'id, title, genres, keywords', wanted.movie, 'movie')) items.set(`movie:${it.id}`, it);
    for (const it of await load('tv', 'id, name AS title, genres, keywords', wanted.tv, 'tv')) items.set(`tv:${it.id}`, it);
    for (const it of items.values()) {
        it.genreIds = it.genres.map(g => Number(g.id ?? g));
        it.hVector = graph.vectorizeKeywords(ocean.keywordsOf(it));
    }
    console.log(`item con metadati: ${items.size} (film ${[...items.keys()].filter(k => k.startsWith('movie')).length}, serie ${[...items.keys()].filter(k => k.startsWith('tv')).length})`);

    /** Profilo di PRODUZIONE dai semi: stessa strada di ProfileBuilder. */
    const productionProfile = seedItems => {
        const raw = {};
        for (const item of seedItems) {
            const kws = ocean.keywordsOf(item);
            const vec = dna.extractActiveDNAFromTmdbData({
                genre_ids: item.genreIds, origin_country: [],
                keywords: { results: kws }, keyword_ids: kws.map(k => String(k.id))
            }, 100);
            for (const [key, value] of Object.entries(vec)) raw[key] = (raw[key] || 0) + value;
        }
        return dna.computeFinalDNA({}, dna.computeActiveDNA(raw), seedItems.length * 3);
    };

    const rankBy = null;
    const recall = (order, gold, n) => {
        if (gold.length === 0) return null;
        const top = new Set(order.slice(0, n));
        return gold.filter(g => top.has(g)).length / gold.length;
    };

    const rankFromMap = map => [...map.entries()]
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
        .map(([k]) => k);

    const rows = [];
    for (const trial of trials) {
        const seeds = trial.seeds.map(([t, id]) => items.get(`${t}:${id}`)).filter(Boolean);
        const cands = trial.candidates
            .map(([t, id]) => [`${t}:${id}`, items.get(`${t}:${id}`)])
            .filter(([, i]) => i);
        if (seeds.length === 0 || cands.length === 0) continue;

        const profile = productionProfile(seeds);
        const baseScore = new Map(cands.map(([k, i]) => [k, ProfileScorer._computeThematicScoreForVector(profile, i.genreIds, i.hVector)]));
        const zip = (arr) => new Map(cands.map(([k], idx) => [k, arr[idx]]));
        const studScore = zip(trial.student), popScore = zip(trial.pop), teachScore = zip(trial.teacher);

        const minMax = m => {
            const vals = [...m.values()];
            const lo = Math.min(...vals), hi = Math.max(...vals), span = (hi - lo) || 1;
            return new Map([...m].map(([k, v]) => [k, (v - lo) / span]));
        };
        const nB = minMax(baseScore), nS = minMax(studScore);
        const blend = new Map([...nB].map(([k, v]) => [k, (v + nS.get(k)) / 2]));

        const orders = {
            'base (produzione, L1-L5)': rankFromMap(baseScore),
            'student': rankFromMap(studScore),
            'pop (controllo)': rankFromMap(popScore),
            'teacher (oracolo film)': rankFromMap(teachScore),
            'blend base+student': rankFromMap(blend),
        };

        const goldWatched = new Set();
        for (const f of histories[trial.ctx]?.movie || []) goldWatched.add(`movie:${f}`);
        for (const s of histories[trial.ctx]?.tv || []) goldWatched.add(`tv:${s}`);
        const seedKeys = new Set(seeds.map(s => `${s.type}:${s.id}`));
        const goldAll = [...goldWatched].filter(k => !seedKeys.has(k) && items.has(k));
        const goldFilms = goldAll.filter(k => k.startsWith('movie:'));
        const goldTv = goldAll.filter(k => k.startsWith('tv:'));

        for (const [model, order] of Object.entries(orders)) {
            rows.push({ setting: trial.setting, ctx: trial.ctx, model,
                film50: recall(order, goldFilms, 50), film200: recall(order, goldFilms, 200),
                tv50: recall(order, goldTv, 50), tv200: recall(order, goldTv, 200),
                nFilm: goldFilms.length, nTv: goldTv.length });
        }
    }

    const pct = v => (v === null ? '—' : `${(100 * v).toFixed(1)}%`);
    for (const setting of ['semi_film', 'semi_misti']) {
        const grp = rows.filter(r => r.setting === setting);
        if (grp.length === 0) continue;
        console.log(`\n### ${setting === 'semi_film' ? 'SEMI = SOLO FILM → recuperare le SERIE nascoste (trasferimento puro)' : 'SEMI MISTI (realistico)'}`);
        console.log(`profili ${new Set(grp.map(r => r.ctx)).size} · trial ${grp.length / 5} · titoli nascosti per trial: ${mean(grp.map(r => r.nTv)).toFixed(1)} serie, ${mean(grp.map(r => r.nFilm)).toFixed(1)} film`);
        console.log('| modello | film @50 | **serie @50** | serie @200 | film @200 |');
        console.log('|---|---|---|---|---|');
        for (const model of [...new Set(grp.map(r => r.model))]) {
            const g = grp.filter(r => r.model === model);
            console.log(`| ${model} | ${pct(mean(g.map(r => r.film50)))} | **${pct(mean(g.map(r => r.tv50)))}** | ${pct(mean(g.map(r => r.tv200)))} | ${pct(mean(g.map(r => r.film200)))} |`);
        }
    }
    db.close();
    process.exit(0);
})().catch(e => { console.error('ERRORE:', e.message, e.stack?.split('\n')[1]); process.exit(1); });
