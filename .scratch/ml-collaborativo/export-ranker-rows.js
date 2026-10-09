/**
 * .scratch/ml-collaborativo/export-ranker-rows.js
 *
 * UNA RIGA PER CANDIDATO: e' quello che serve a un ranker (il banco dava solo numeri aggregati).
 *
 * Per ogni account sintetico e per ogni candidato dell'UNIVERSO CONDIVISO (pool di produzione +
 * 2 hop del grafo) scrive:
 *   prod    = lo scorer di produzione (l'incumbent)
 *   lpop    = log(1+voti) — la popolarita', il termine di paragone che oggi ci batte
 *   collab  = coseno nello spazio collaborativo (la posizione nella mappa)
 *   yeardiff= distanza dall'anno mediano della cronologia (recency)
 *   genrec  = coseno fra i generi del candidato e la distribuzione di generi della cronologia
 *   in1     = 1 se e' un vicino DIRETTO di un titolo della cronologia (scelta del grafo)
 *   in2     = 1 se e' a distanza 2
 *   y       = 1 se e' nella verita' (il titolo guardato DOPO)
 *
 * TUTTI gli ordinamenti vengono poi valutati sullo STESSO universo: se no non si confrontano.
 *
 * Uso: SLICE=0:50 ROWS_OUT=.cache/movielens/ranker-0.ndjson node .scratch/ml-collaborativo/export-ranker-rows.js
 */
const fs = require('fs'); const path = require('path'); const duckdb = require('duckdb');
const graph = require('../../src/engines/graph/HierarchicalGraph');
const dna = require('../../src/dna/dnaEngine.js');
const ProfileScorer = require('../../src/profile/ProfileScorer.js');
const ocean = require('../ocean-prototipo/ocean-core.js');

const CACHE = path.join(__dirname, '../../.cache/movielens');
const PARDIR = path.join(__dirname, '../../.cache/tmdb').split(String.fromCharCode(92)).join('/');
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));
const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

(async () => {
    await require('../livello-latente/bootstrap-map.js')();
    const trials0 = JSON.parse(fs.readFileSync(path.join(CACHE, process.env.CAND_FILE || 'graph-candidates-synth.json'), 'utf8'));
    let trials = trials0;
    if (process.env.SLICE) { const [a, b] = process.env.SLICE.split(':').map(Number); trials = trials0.slice(a, b); console.log(`[slice] ${a}-${b} di ${trials0.length}`); }

    const db = new duckdb.Database(':memory:');
    const mk = r => {
        const it = { type: r.type, id: Number(r.id), name: r.name, genres: parse(r.genres) || [], keywords: parse(r.keywords) || [], voteCount: Number(r.vote_count) || 0,
            popularity: Number(r.popularity) || 0, year: Number(String(r.y || '').slice(0, 4)) || 0 };
        it.genreIds = it.genres.map(g => Number(g.id ?? g));
        it.kwNums = new Set(ocean.keywordsOf(it).map(x => Number(x.id)));
        // ANCHE I NOMI: getKeywordsForNodes(L2) restituisce nomi, non id (la stessa doppia forma del bug DNA).
        // Confrontando una sola forma il filtro per keyword sparisce in silenzio e il pool si allarga a 10k.
        it.kwNames = new Set(ocean.keywordsOf(it).map(x => String(x.name || '').toLowerCase()).filter(Boolean));
        return it;
    };
    const items = new Map();
    // 1) il POOL PROXY di produzione: i piu' popolari (stesso perimetro dei run precedenti)
    const poolRows = [
        ...(await all(db, `SELECT id, title AS name, genres, keywords, vote_count, popularity, release_date AS y FROM read_parquet('${PARDIR}/movies.parquet') ORDER BY popularity DESC LIMIT 12000`)).map(r => ({ ...r, type: 'movie' })),
        ...(await all(db, `SELECT id, name, genres, keywords, vote_count, popularity, first_air_date AS y FROM read_parquet('${PARDIR}/tv.parquet') ORDER BY popularity DESC LIMIT 6000`)).map(r => ({ ...r, type: 'tv' }))
    ];
    for (const r of poolRows) { const it = mk(r); items.set(`${it.type}:${it.id}`, it); }
    const poolKeys = new Set(items.keys());
    console.log(`pool proxy: ${poolKeys.size}`);
    // 2) i titoli dei trial che non stanno nel pool (i visti e i candidati del grafo)
    const need = new Set();
    for (const t of trials) for (const k of [...t.seeds, ...t.gold, ...t.onehop, ...t.twohop]) need.add(k);
    const byType = { movie: [], tv: [] };
    for (const k of need) if (!items.has(k)) { const [ty, id] = k.split(':'); (byType[ty] || (byType[ty] = [])).push(Number(id)); }
    for (const [ty, ids] of Object.entries(byType)) {
        const table = ty === 'movie' ? 'movies' : 'tv';
        const col = ty === 'movie' ? 'title' : 'name';
        const ycol = ty === 'movie' ? 'release_date' : 'first_air_date';
        for (let i = 0; i < ids.length; i += 400) {
            const chunk = ids.slice(i, i + 400);
            const rs = await all(db, `SELECT id, ${col} AS name, genres, keywords, vote_count, popularity, ${ycol} AS y FROM read_parquet('${PARDIR}/${table}.parquet') WHERE id IN (${chunk.join(',')})`);
            for (const r of rs) { const it = mk({ ...r, type: ty }); items.set(`${ty}:${it.id}`, it); }
        }
    }
    console.log(`titoli con metadati: ${items.size} (pool ${poolKeys.size} + trial ${items.size - poolKeys.size})`);
    const hvec = it => (it.hVector || (it.hVector = graph.vectorizeKeywords(ocean.keywordsOf(it))));
    const POS = JSON.parse(fs.readFileSync(path.join(CACHE, 'positions.json'), 'utf8'));
    const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

    const productionProfile = seeds => {
        const raw = {};
        for (const item of seeds) {
            const kws = ocean.keywordsOf(item);
            const vec = dna.extractActiveDNAFromTmdbData({ genre_ids: item.genreIds, origin_country: [], keywords: { results: kws }, keyword_ids: kws.map(k => String(k.id)) }, 100);
            for (const [k, v] of Object.entries(vec)) raw[k] = (raw[k] || 0) + v;
        }
        return dna.computeFinalDNA({}, dna.computeActiveDNA(raw), seeds.length * 3);
    };
    const realPool = (profileVector, exclude) => {
        // POOL=full: il pool INTERO, senza il filtro genere+keyword. Il pool e' solo la lista da cui
        // l'ordinamento pesca: filtrarlo in anticipo butta via verita' che il ranker saprebbe ordinare.
        if (process.env.POOL === "full") return [...poolKeys].filter(k => !exclude.has(k));
        const genres = Object.entries(profileVector).filter(([k]) => k.startsWith('g:'))
            .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => Number(k.slice(2)));
        const l2 = Object.entries(profileVector).filter(([k]) => k.startsWith('L2:'))
            .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k.slice(3));
        const kwIds = new Set(), kwNames = new Set();
        if (l2.length > 0) {
            const map = graph.getKeywordsForNodes(l2, 'L2');
            for (const kws of map.values()) for (const kw of kws) {
                if (/^\d+$/.test(String(kw))) kwIds.add(Number(kw)); else kwNames.add(String(kw).toLowerCase());
            }
        }
        if (kwIds.size === 0 && kwNames.size === 0) {
            for (const [k] of Object.entries(profileVector).filter(([x]) => x.startsWith('k:'))
                .sort((a, b) => b[1] - a[1]).slice(0, 10)) {
                const tok = String(k.slice(2));
                if (/^\d+$/.test(tok)) kwIds.add(Number(tok)); else kwNames.add(tok.toLowerCase());
            }
        }
        const out = [];
        for (const k of poolKeys) {
            if (exclude.has(k)) continue;
            const it = items.get(k); if (!it) continue;
            if (genres.length && !it.genreIds.some(g => genres.includes(g))) continue;
            if (kwIds.size || kwNames.size) {
                const okId = kwIds.size && [...it.kwNums].some(x => kwIds.has(x));
                const okName = kwNames.size && [...it.kwNames].some(n => kwNames.has(n));
                if (!okId && !okName) continue;
            }
            out.push(k);
        }
        return out;
    };

    const out = fs.createWriteStream(process.env.ROWS_OUT || path.join(CACHE, 'ranker-rows.ndjson'));
    let n = 0, nPos = 0;
    for (const t of trials) {
        const seeds = t.seeds.map(k => items.get(k)).filter(Boolean);
        if (seeds.length < 2) continue;
        const profile = productionProfile(seeds);
        const profVec = (() => {
            const vs = t.seeds.map(k => POS[k]).filter(Boolean);
            if (!vs.length) return null;
            const v = new Array(vs[0].length).fill(0);
            for (const x of vs) for (let i = 0; i < v.length; i++) v[i] += x[i];
            const nn = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
            return v.map(x => x / nn);
        })();
        const seedKeys = new Set(t.seeds);
        const gold = new Set(t.gold);
        const onehop = new Set(t.onehop), twohop = new Set(t.twohop);
        // generi del profilo: distribuzione sui generi dei titoli visti
        const gv = new Array(30).fill(0);
        for (const s of seeds) for (const g of s.genreIds) if (g < 30) gv[g] += 1;
        const gnn = Math.sqrt(gv.reduce((s, x) => s + x * x, 0)) || 1;
        const profGen = gv.map(x => x / gnn);
        const medYear = median(seeds.map(s => s.year).filter(Boolean));
        // UNIVERSO CONDIVISO: pool di produzione + 2 hop del grafo (la verita' puo' stare in entrambi)
        const universe = new Set([...realPool(profile, seedKeys), ...t.twohop]);
        for (const k of seedKeys) universe.delete(k);
        for (const k of universe) {
            const it = items.get(k); if (!it) continue;
            const prod = ProfileScorer._computeThematicScoreForVector(profile, it.genreIds, hvec(it));
            const collab = (profVec && POS[k]) ? dot(POS[k], profVec) : 0;
            const cv = new Array(30).fill(0);
            for (const g of it.genreIds) if (g < 30) cv[g] = 1;
            const cnn = Math.sqrt(cv.reduce((s, x) => s + x * x, 0)) || 1;
            let genrec = 0;
            for (let i = 0; i < 30; i++) genrec += (cv[i] / cnn) * profGen[i];
            const y = gold.has(k) ? 1 : 0;
            nPos += y;
            out.write(JSON.stringify({ c: t.ctx, s: t.strato, k, y, prod: +prod.toFixed(5), lpop: +Math.log1p(it.voteCount).toFixed(3),
                collab: +collab.toFixed(5), yeardiff: it.year && medYear ? Math.abs(it.year - medYear) : 30,
                genrec: +genrec.toFixed(4), in1: onehop.has(k) ? 1 : 0, in2: twohop.has(k) ? 1 : 0 }) + '\n');
            n++;
        }
    }
    await new Promise(res => out.end(res));
    console.log(`righe scritte: ${n} · positive: ${nPos} (${(100 * nPos / Math.max(1, n)).toFixed(2)}%)`);
    db.close();
    process.exit(0);
})().catch(e => { console.error('ERRORE:', e.message, e.stack?.split('\n')[1]); process.exit(1); });
