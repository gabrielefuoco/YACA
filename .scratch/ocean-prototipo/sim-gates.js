/**
 * .scratch/ocean-prototipo/sim-gates.js   —  PROTOTIPO
 *
 * LE IPOTESI DELL'UTENTE, misurate una per una:
 *   «capire se preferisce film lunghi o corti»          → gate DURATA
 *   «se è aperto alle novità o alle cose complesse»     → gate NICCHIA (rarità keyword) ed EPOCA
 *   «associare i film alle serie»                       → gate CROSS-MEDIA
 *
 * Metodo (lo stesso del cold start, leave-out sulla storia reale):
 * si mostrano k titoli al modello, si nasconde il resto, e si misura quanti dei
 * titoli nascosti entrano nella top-50/top-200 di un pool di ~2.000. Un gate è
 * utile solo se ALZA quel numero: altrimenti è decorazione.
 *
 * Un gate è un moltiplicatore costruito DAI SEMI STESSI:
 *   durata  × (1 + peso · exp(-|durata - mediana semi| / 40 min))
 *   nicchia × (1 + peso · affinità fra la rarità media dei semi e quella del titolo)
 *   epoca   × (1 + peso · exp(-|anno - mediana semi| / 25 anni))
 *
 * Uso: node .scratch/ocean-prototipo/sim-gates.js
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

const PARQUET_DIR = path.join(__dirname, '../../.cache/tmdb').split(String.fromCharCode(92)).join('/');
const DISTRACTORS = 1200;
const K_LIST = [3, 5];
const DRAWS = 4;
const GATE_WEIGHT = 0.35;

const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));

async function loadItems(byType) {
    const db = new duckdb.Database(':memory:');
    const rows = [];
    if (byType.movie.length) {
        rows.push(...(await all(db, `SELECT id, title AS name, genres, keywords, runtime, release_date FROM read_parquet('${PARQUET_DIR}/movies.parquet') WHERE id IN (${byType.movie.join(',')})`))
            .map(r => ({ ...r, type: 'movie' })));
    }
    if (byType.tv.length) {
        rows.push(...(await all(db, `SELECT id, name, genres, keywords, NULL AS runtime, first_air_date AS release_date FROM read_parquet('${PARQUET_DIR}/tv.parquet') WHERE id IN (${byType.tv.join(',')})`))
            .map(r => ({ ...r, type: 'tv' })));
    }
    return rows.map(r => ({
        id: Number(r.id), type: r.type, name: r.name,
        genres: parse(r.genres) || [], keywords: parse(r.keywords) || [],
        runtime: Number(r.runtime) || null,
        year: Number(String(r.release_date || '').slice(0, 4)) || null
    }));
}

async function distractors(excludeMovies, excludeTv) {
    const db = new duckdb.Database(':memory:');
    const notM = excludeMovies.length ? `AND id NOT IN (${excludeMovies.join(',')})` : '';
    const notT = excludeTv.length ? `AND id NOT IN (${excludeTv.join(',')})` : '';
    const m = (await all(db, `SELECT id, title AS name, genres, keywords, runtime, release_date FROM read_parquet('${PARQUET_DIR}/movies.parquet') WHERE 1=1 ${notM} ORDER BY popularity DESC LIMIT ${DISTRACTORS}`))
        .map(r => ({ ...r, type: 'movie' }));
    const t = (await all(db, `SELECT id, name, genres, keywords, NULL AS runtime, first_air_date AS release_date FROM read_parquet('${PARQUET_DIR}/tv.parquet') WHERE 1=1 ${notT} ORDER BY popularity DESC LIMIT ${DISTRACTORS}`))
        .map(r => ({ ...r, type: 'tv' }));
    return [...m, ...t].map(r => ({
        id: Number(r.id), type: r.type, name: r.name,
        genres: parse(r.genres) || [], keywords: parse(r.keywords) || [],
        runtime: Number(r.runtime) || null,
        year: Number(String(r.release_date || '').slice(0, 4)) || null
    }));
}

const rarityOf = (item, dfMap) => {
    const kws = ocean.keywordsOf(item).filter(k => k && k.id);
    if (!kws.length || !dfMap) return null;
    const vals = kws.map(k => dfMap.get(`k:${k.id}`)).filter(v => Number.isFinite(v));
    if (!vals.length) return null;
    return median(vals);
};

const topN = (scored, n) => scored.slice(0, n).map(s => `${s.type}:${s.id}`);
const recall = (list, gold, n) => {
    const top = new Set(list.slice(0, n));
    return gold.length ? gold.filter(id => top.has(id)).length / gold.length : 0;
};

(async () => {
    await require('../livello-latente/bootstrap-map.js')();
    const dfMap = dna.getGlobalDfCache();
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const dbm = mongoose.connection.db;

    const profiles = await dbm.collection('tasteprofiles').find({}).project({ owner: 1, context: 1 }).toArray();
    const owner = profiles[0].owner;
    const histories = await dbm.collection('watchhistories').find({ owner })
        .project({ context: 1, tmdbId: 1, type: 1, lastWatchedAt: 1, createdAt: 1, signals: 1 }).toArray();

    const byProfile = new Map();
    for (const h of histories) {
        const key = h.context;
        if (!byProfile.has(key)) byProfile.set(key, []);
        const at = h.lastWatchedAt || h.createdAt || (h.signals || []).map(s => s.at).filter(Boolean).sort().pop();
        byProfile.get(key).push({ tmdbId: Number(h.tmdbId), type: (h.type === 'tv' || h.type === 'series' || h.type === 'anime') ? 'tv' : 'movie', at: at ? new Date(at).getTime() : 0 });
    }
    const usable = [...byProfile.entries()].filter(([, l]) => l.length >= 12);

    const byType = { movie: new Set(), tv: new Set() };
    for (const [, l] of usable) for (const h of l) byType[h.type].add(h.tmdbId);
    const known = new Map((await loadItems({ movie: [...byType.movie], tv: [...byType.tv] })).map(i => [`${i.type}:${i.id}`, i]));
    const pool = await distractors([...byType.movie], [...byType.tv]);
    for (const i of pool) known.set(`${i.type}:${i.id}`, i);
    const catalogue = [...known.values()].map(i => ({ ...i, hVector: graph.vectorizeKeywords(ocean.keywordsOf(i)), rarity: rarityOf(i, dfMap) }));

    let seedState = 424242;
    const rnd = () => { seedState = (seedState * 1103515245 + 12345) % 2147483648; return seedState / 2147483648; };
    const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

    const sparseProfileFrom = seeds => {
        const raw = {};
        for (const item of seeds) {
            const payload = {
                genre_ids: item.genres.map(g => Number(g.id ?? g)), origin_country: [],
                keywords: { results: ocean.keywordsOf(item) },
                keyword_ids: ocean.keywordsOf(item).map(k => String(k.id))
            };
            const vec = dna.extractActiveDNAFromTmdbData(payload, 100);
            for (const [k, v] of Object.entries(vec)) raw[k] = (raw[k] || 0) + v;
        }
        return dna.computeFinalDNA({}, dna.computeActiveDNA(raw), seeds.length * 3);
    };

    const rows = [];
    for (const k of K_LIST) {
        for (const [context, list] of usable) {
            const items = list.map(h => known.get(`${h.type}:${h.tmdbId}`)).filter(Boolean);
            if (items.length < k + 6) continue;
            for (let draw = 0; draw < DRAWS; draw++) {
                const shuffled = shuffle(items);
                const seeds = shuffled.slice(0, k);
                const hiddenAll = shuffled.slice(k);
                const hiddenSame = hiddenAll.filter(i => i.type === 'movie');
                const hiddenTv = hiddenAll.filter(i => i.type === 'tv');
                const goldSame = hiddenSame.map(i => `movie:${i.id}`);

                const profile = sparseProfileFrom(seeds);
                const seedsRuntime = median(seeds.filter(s => s.runtime).map(s => s.runtime));
                const seedsYear = median(seeds.filter(s => s.year).map(s => s.year));
                const seedsRarity = median(seeds.map(s => s.rarity).filter(Number.isFinite));

                const gate = (item, kind) => {
                    if (kind === 'runtime') {
                        if (!seedsRuntime || !item.runtime) return 1;
                        return 1 + GATE_WEIGHT * Math.exp(-Math.abs(item.runtime - seedsRuntime) / 40);
                    }
                    if (kind === 'era') {
                        if (!seedsYear || !item.year) return 1;
                        return 1 + GATE_WEIGHT * Math.exp(-Math.abs(item.year - seedsYear) / 25);
                    }
                    if (kind === 'niche') {
                        if (!Number.isFinite(seedsRarity) || !Number.isFinite(item.rarity)) return 1;
                        const scale = 20000;
                        return 1 + GATE_WEIGHT * Math.exp(-Math.abs(Math.log10(item.rarity) - Math.log10(seedsRarity)) * 1.5) * (scale > 0 ? 1 : 1);
                    }
                    return 1;
                };

                const scoreOf = (item, kinds = []) => {
                    const gids = item.genres.map(g => Number(g.id ?? g));
                    let s = ProfileScorer._computeThematicScoreForVector(profile, gids, item.hVector);
                    for (const kind of kinds) s *= gate(item, kind);
                    return s;
                };

                const rank = kinds => catalogue
                    .filter(i => i.type === 'movie')
                    .map(i => ({ ...i, score: scoreOf(i, kinds) }))
                    .sort((a, b) => (b.score - a.score) || a.id - b.id);

                const base = rank([]);
                const withRuntime = rank(['runtime']);
                const withEra = rank(['era']);
                const withNiche = rank(['niche']);
                const allGates = rank(['runtime', 'era', 'niche']);

                // cross-media: semi SOLO film → si cerca fra le SERIE nascoste
                const crossRanked = catalogue
                    .filter(i => i.type === 'tv' && !seeds.some(s => s.id === i.id && s.type === i.type))
                    .map(i => ({ ...i, score: scoreOf(i, []) }))
                    .sort((a, b) => (b.score - a.score) || a.id - b.id);
                const tvInside = catalogue.filter(i => i.type === 'tv').map(i => ({ ...i, score: scoreOf(i, []) })).sort((a, b) => (b.score - a.score) || a.id - b.id);

                rows.push({
                    k, context,
                    base50: recall(topN(base, 50), goldSame, 50), base200: recall(topN(base, 200), goldSame, 200),
                    run50: recall(topN(withRuntime, 50), goldSame, 50), run200: recall(topN(withRuntime, 200), goldSame, 200),
                    era50: recall(topN(withEra, 50), goldSame, 50), era200: recall(topN(withEra, 200), goldSame, 200),
                    niche50: recall(topN(withNiche, 50), goldSame, 50), niche200: recall(topN(withNiche, 200), goldSame, 200),
                    all50: recall(topN(allGates, 50), goldSame, 50), all200: recall(topN(allGates, 200), goldSame, 200),
                    cross50: recall(topN(crossRanked, 50), hiddenTv.map(i => `tv:${i.id}`), 50),
                    cross200: recall(topN(crossRanked, 200), hiddenTv.map(i => `tv:${i.id}`), 200),
                    tvRandom50: hiddenTv.length ? 50 / tvInside.length : 0,
                    hiddenTv: hiddenTv.length
                });
            }
        }
    }

    const pct = v => `${(100 * v).toFixed(1)}%`;
    console.log(`\n== I GATE DEI «BISOGNI» AIUTANO? (${rows.length} prove, leave-out su storia reale) ==\n`);
    console.log(`| semi k | base @50 | +durata | +epoca | +nicchia | tutti | base @200 | +durata | +epoca | +nicchia | tutti |`);
    console.log(`|---|---|---|---|---|---|---|---|---|---|---|`);
    for (const k of K_LIST) {
        const r = rows.filter(x => x.k === k);
        if (!r.length) continue;
        console.log(`| ${k} | ${pct(mean(r.map(x => x.base50)))} | ${pct(mean(r.map(x => x.run50)))} | ${pct(mean(r.map(x => x.era50)))} | ${pct(mean(r.map(x => x.niche50)))} | ${pct(mean(r.map(x => x.all50)))}`
            + ` | ${pct(mean(r.map(x => x.base200)))} | ${pct(mean(r.map(x => x.run200)))} | ${pct(mean(r.map(x => x.era200)))} | ${pct(mean(r.map(x => x.niche200)))} | ${pct(mean(r.map(x => x.all200)))} |`);
    }
    const cross = rows.filter(r => r.hiddenTv > 0);
    console.log(`\n== CROSS-MEDIA: semi di FILM, si cercano le SERIE nascoste ==`);
    console.log(`recall@50 ${pct(mean(cross.map(x => x.cross50)))} · recall@200 ${pct(mean(cross.map(x => x.cross200)))} · caso casuale @50 ${pct(mean(cross.map(x => x.tvRandom50)))}`);

    await mongoose.disconnect();
})().catch(err => { console.error('ERRORE:', err.message); process.exit(1); });
