/**
 * .scratch/ocean-prototipo/sim-coldstart.js   —  PROTOTIPO
 *
 * LA DOMANDA: con pochi titoli visti, una rappresentazione a 5 dimensioni dense
 * ritrova il gusto dell'utente meglio del vettore sparso?
 *
 * COME SI MISURA (leave-out sulla storia REALE, non su titoli popolari):
 *  - dai 5 profili reali si prende la cronologia vera (WatchHistory su Atlas, sola lettura);
 *  - si nascondono il grosso dei titoli e se ne mostrano k (1, 3, 5, 10) al modello;
 *  - il modello ordina un pool = i titoli nascosti + 2.000 esca popolari;
 *  - metrica: quanti dei titoli NASCOSTI finiscono nella top-50 e top-200 (recall).
 *    Caso casuale: 50/pool ≈ 2,2%.
 *
 * I tre concorrenti, addestrati sugli STESSI k semi:
 *  A) vettore sparso (l'attuale, col fix id<->nome attivo);
 *  B) OCEAN 5-dim (questo prototipo);
 *  C) miscela 50/50 dei due punteggi normalizzati.
 *
 * Limite dichiarato: la cronologia reale di un contesto è di ~20 titoli, quindi i
 * numeri sono rumorosi; per questo si mediano più estrazioni casuali di semi.
 *
 * Uso: node .scratch/ocean-prototipo/sim-coldstart.js
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const duckdb = require('duckdb');
const ocean = require('./ocean-core.js');
const graph = require('../../src/engines/graph/HierarchicalGraph');
const dna = require('../../src/dna/dnaEngine.js');
const ProfileScorer = require('../../src/profile/ProfileScorer.js');
const { connectMongo } = require('../../src/utils/mongoConnect');

const PARQUET_DIR = path.join(__dirname, '../../.cache/tmdb').replace(/\\/g, '/');
const BACKSLASH = String.fromCharCode(92);
const DISTRACTORS = 2000;
const K_LIST = [1, 3, 5, 10];
const DRAWS = 6;

const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** Titoli coinvolti: cronologie reali + esca popolare, film e serie. */
async function loadItems(idsByType) {
    const db = new duckdb.Database(':memory:');
    const all = sql => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));
    const rows = [];
    const movieIds = (idsByType.movie || []).map(Number).filter(Number.isFinite);
    if (movieIds.length > 0) {
        const list = movieIds.join(',');
        rows.push(...(await all(`SELECT id, title AS name, genres, keywords, vote_count FROM read_parquet('${PARQUET_DIR}/movies.parquet') WHERE id IN (${list})`))
            .map(r => ({ ...r, type: 'movie' })));
    }
    const tvIds = (idsByType.tv || []).map(Number).filter(Number.isFinite);
    if (tvIds.length > 0) {
        const list = tvIds.join(',');
        rows.push(...(await all(`SELECT id, name, genres, keywords, vote_count FROM read_parquet('${PARQUET_DIR}/tv.parquet') WHERE id IN (${list})`))
            .map(r => ({ ...r, type: 'tv' })));
    }
    return rows.map(r => ({
        id: Number(r.id),
        type: r.type,
        name: r.name,
        genres: parse(r.genres) || [],
        keywords: parse(r.keywords) || []
    }));
}

async function popularDistractors(exclude) {
    const db = new duckdb.Database(':memory:');
    const all = sql => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));
    const notIn = exclude.length > 0 ? `AND id NOT IN (${exclude.join(',')})` : '';
    const movies = (await all(`SELECT id, title AS name, genres, keywords FROM read_parquet('${PARQUET_DIR}/movies.parquet') WHERE vote_count > 800 ${notIn} ORDER BY popularity DESC LIMIT ${DISTRACTORS / 2}`))
        .map(r => ({ ...r, type: 'movie' }));
    const tv = (await all(`SELECT id, name, genres, keywords FROM read_parquet('${PARQUET_DIR}/tv.parquet') WHERE vote_count > 200 ${notIn} ORDER BY popularity DESC LIMIT ${DISTRACTORS / 2}`))
        .map(r => ({ ...r, type: 'tv' }));
    return [...movies, ...tv].map(r => ({ id: Number(r.id), type: r.type, name: r.name, genres: parse(r.genres) || [], keywords: parse(r.keywords) || [] }));
}

/** Il vettore sparso dell'utente dai k semi, come lo costruisce ProfileBuilder. */
function sparseProfileFrom(seedItems) {
    const rawActive = {};
    for (const item of seedItems) {
        const payload = {
            genre_ids: item.genres.map(g => Number(g.id ?? g)),
            origin_country: [],
            keywords: { results: ocean.keywordsOf(item) },
            keyword_ids: ocean.keywordsOf(item).map(k => String(k.id))
        };
        const itemDna = dna.extractActiveDNAFromTmdbData(payload, 100);
        for (const [k, v] of Object.entries(itemDna)) rawActive[k] = (rawActive[k] || 0) + v;
    }
    return dna.computeFinalDNA({}, dna.computeActiveDNA(rawActive), seedItems.length * 3);
}

function sparseScore(profile, item) {
    const gids = item.genres.map(g => Number(g.id ?? g));
    const hVector = graph.vectorizeKeywords(ocean.keywordsOf(item));
    return ProfileScorer._computeThematicScoreForVector(profile, gids, hVector);
}

function topN(scored, n) {
    return [...scored].sort((a, b) => (b.score - a.score) || (a.id - b.id)).slice(0, n).map(s => s.id);
}

const recall = (list, gold, n) => {
    const top = new Set(list.slice(0, n));
    return gold.filter(id => top.has(id)).length / gold.length;
};

(async () => {
    await require('../livello-latente/bootstrap-map.js')();
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const db = mongoose.connection.db;

    const profiles = await db.collection('tasteprofiles').find({}).project({ owner: 1, context: 1 }).toArray();
    const histories = await db.collection('watchhistories').find({ owner: { $in: profiles.map(p => p.owner) } })
        .project({ owner: 1, context: 1, tmdbId: 1, type: 1, lastWatchedAt: 1, createdAt: 1, signals: 1 }).toArray();

    const byProfile = new Map();
    for (const h of histories) {
        const key = `${h.owner}/${h.context}`;
        if (!byProfile.has(key)) byProfile.set(key, []);
        const at = h.lastWatchedAt || h.createdAt || (h.signals || []).map(s => s.at).filter(Boolean).sort().pop();
        byProfile.get(key).push({ tmdbId: Number(h.tmdbId), type: h.type === 'tv' || h.type === 'series' || h.type === 'anime' ? 'tv' : 'movie', at: at ? new Date(at).getTime() : 0 });
    }

    const usable = [...byProfile.entries()].filter(([, list]) => list.length >= 12);
    console.log(`\nprofili con almeno 12 titoli in cronologia: ${usable.length} su ${byProfile.size}`);

    const idsByType = { movie: new Set(), tv: new Set() };
    for (const [, list] of usable) for (const h of list) idsByType[h.type].add(h.tmdbId);
    const knownItems = new Map((await loadItems({ movie: [...idsByType.movie], tv: [...idsByType.tv] })).map(i => [`${i.type}:${i.id}`, i]));

    const distractors = await popularDistractors([...idsByType.movie]);
    const distractorKey = new Set(distractors.map(i => `${i.type}:${i.id}`));

    // Generatore deterministico: stesse estrazioni a ogni run.
    let seedState = 987654321;
    const rnd = () => { seedState = (seedState * 1103515245 + 12345) % 2147483648; return seedState / 2147483648; };
    const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

    const results = [];
    for (const k of K_LIST) {
        for (const [profileKey, list] of usable) {
            const known = list
                .map(h => ({ h, item: knownItems.get(`${h.type}:${h.tmdbId}`) }))
                .filter(x => x.item);
            if (known.length < k + 6) continue;

            for (let draw = 0; draw < DRAWS; draw++) {
                const pool = shuffle(known);
                const seeds = pool.slice(0, k);
                const gold = pool.slice(k).map(x => x.item.id);

                const candidates = [
                    ...pool.slice(k).map(x => x.item),
                    ...distractors.filter(d => !known.some(x => x.item.id === d.id))
                ];
                if (candidates.length < 100) continue;

                const sparse = sparseProfileFrom(seeds.map(s => s.item));
                const oceanProfile = ocean.profileOcean(seeds.map(s => ({ item: s.item, daysAgo: 0 })));

                // Gli assi sono fortemente compressi attorno alla media (il coseno medio
                // fra due titoli qualsiasi è 0,63): prima di dichiarare che il denso perde,
                // gli si dà la versione standardizzata, calibrata sul pool. Così si separa
                // "la proiezione a 5 assi" da "la scala su cui sta".
                const oceanVectors = candidates.map(item => ocean.itemOcean(item).vector).filter(Boolean);
                const meanT = ocean.TRAITS.map((_, i) => mean(oceanVectors.map(v => v[i])));
                const stdT = ocean.TRAITS.map((_, i) => {
                    const m = meanT[i];
                    return Math.sqrt(mean(oceanVectors.map(v => (v[i] - m) ** 2))) || 1;
                });
                const zOf = v => (v ? v.map((x, i) => (x - meanT[i]) / stdT[i]) : null);

                const rawSparse = candidates.map(item => ({ id: item.id, score: sparseScore(sparse, item) }));
                const rawOcean = candidates.map(item => ({ id: item.id, score: ocean.cosine(oceanProfile.vector, ocean.itemOcean(item).vector) }));
                const rawOceanZ = candidates.map(item => ({ id: item.id, score: ocean.cosine(zOf(oceanProfile.vector), zOf(ocean.itemOcean(item).vector)) }));

                const minMax = rows => {
                    const vals = rows.map(r => r.score);
                    const lo = Math.min(...vals), hi = Math.max(...vals);
                    const span = hi - lo || 1;
                    return new Map(rows.map(r => [r.id, (r.score - lo) / span]));
                };
                const nSparse = minMax(rawSparse), nOcean = minMax(rawOcean), nOceanZ = minMax(rawOceanZ);
                const blended = candidates.map(item => ({ id: item.id, score: (nSparse.get(item.id) + nOcean.get(item.id)) / 2 }));
                const blendedZ = candidates.map(item => ({ id: item.id, score: (nSparse.get(item.id) + nOceanZ.get(item.id)) / 2 }));

                results.push({
                    k, profileKey,
                    sparse50: recall(topN(rawSparse, 50), gold, 50), sparse200: recall(topN(rawSparse, 200), gold, 200),
                    ocean50: recall(topN(rawOcean, 50), gold, 50), ocean200: recall(topN(rawOcean, 200), gold, 200),
                    oceanZ50: recall(topN(rawOceanZ, 50), gold, 50), oceanZ200: recall(topN(rawOceanZ, 200), gold, 200),
                    blend50: recall(topN(blended, 50), gold, 50), blend200: recall(topN(blended, 200), gold, 200),
                    blendZ50: recall(topN(blendedZ, 50), gold, 50), blendZ200: recall(topN(blendedZ, 200), gold, 200),
                    poolSize: candidates.length
                });
            }
        }
    }

    const pct = v => `${(100 * v).toFixed(1)}%`;
    console.log(`\n== COLD START: recuperare la cronologia nascosta (${results.length} prove, ${DRAWS} estrazioni × profilo) ==\n`);
    console.log(`| semi k | sparso @50 | OCEAN @50 | OCEAN z @50 | miscela z @50 | sparso @200 | OCEAN @200 | OCEAN z @200 | miscela z @200 |`);
    console.log(`|---|---|---|---|---|---|---|---|---|`);
    for (const k of K_LIST) {
        const r = results.filter(x => x.k === k);
        if (r.length === 0) continue;
        console.log(`| ${k} | ${pct(mean(r.map(x => x.sparse50)))} | ${pct(mean(r.map(x => x.ocean50)))} | ${pct(mean(r.map(x => x.oceanZ50)))} | ${pct(mean(r.map(x => x.blendZ50)))}`
            + ` | ${pct(mean(r.map(x => x.sparse200)))} | ${pct(mean(r.map(x => x.ocean200)))} | ${pct(mean(r.map(x => x.oceanZ200)))} | ${pct(mean(r.map(x => x.blendZ200)))} |`);
    }
    const pool = mean(results.map(r => r.poolSize));
    console.log(`\ncaso casuale atteso @50: ${pct(50 / pool)} · @200: ${pct(200 / pool)}`);

    await mongoose.disconnect();
})().catch(err => { console.error('ERRORE:', err.message); process.exit(1); });
