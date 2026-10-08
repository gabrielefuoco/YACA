/**
 * .scratch/ml-collaborativo/bench-graph-funnel.js
 *
 * IL GRAFO DAVANTI ALLO SCORER, A PARITA' DI BUDGET.
 * Stessi semi, stesso pool di titoli nascosti, stesso RANKER (lo scorer di produzione):
 * cambia solo DA DOVE vengono i candidati.
 *
 *   graph: i candidati del grafo (1 hop, 2 hop, cluster + cluster dei vicini)
 *   pool : l'insieme ampio che usa oggi la generazione (condivide un genere coi semi)
 *   caso : SCONTRO ALLA PARI — gli stessi posti, riempiti a caso dal pool
 *
 * Se il grafo batte il controllo a parità di posti, il suo contributo e' la SCELTA
 * dei candidati, non l'ordinamento.
 *
 * Uso: node .scratch/ml-collaborativo/bench-graph-funnel.js
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
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

(async () => {
    await require('../livello-latente/bootstrap-map.js')();
    // --- INIEZIONE DEL SEGNALE LATERALE (L1_adjacency): la chiave che la produzione non ha.
    // Senza L1_ADJ il banco gira nello stato di oggi: grafo con diffusione orizzontale MORTA.
    if (process.env.L1_ADJ) {
        const adj = JSON.parse(fs.readFileSync(process.env.L1_ADJ, 'utf8'));
        graph.data.L1_adjacency = adj;
        if (typeof graph.invalidateKeywordCaches === 'function') graph.invalidateKeywordCaches();
        console.log('[bench] L1_adjacency INIETTATA: ' + Object.keys(adj).length + ' cluster con vicini');
    } else {
        console.log('[bench] L1_adjacency ASSENTE (stato di produzione)');
    }
    const trials = JSON.parse(fs.readFileSync(path.join(CACHE, 'graph-candidates.json'), 'utf8'));

    const keys = new Set();
    for (const t of trials) { for (const k of [...t.seeds, ...t.gold, ...t.onehop, ...t.twohop, ...t.cluster]) keys.add(k); }
    // pool proxy: i titoli popolari del catalogo (quello che la generazione attuale puo' pescare)
    const db = new duckdb.Database(':memory:');
    const rows = [
        ...(await all(db, `SELECT id, title AS name, genres, keywords, vote_count FROM read_parquet('${PARDIR}/movies.parquet') ORDER BY popularity DESC LIMIT 12000`)).map(r => ({ ...r, type: 'movie' })),
        ...(await all(db, `SELECT id, name, genres, keywords, vote_count FROM read_parquet('${PARDIR}/tv.parquet') ORDER BY popularity DESC LIMIT 6000`)).map(r => ({ ...r, type: 'tv' }))
    ];
    const items = new Map();
    for (const r of rows) {
        const it = { type: r.type, id: Number(r.id), name: r.name, genres: parse(r.genres) || [], keywords: parse(r.keywords) || [], voteCount: Number(r.vote_count) || 0 };
        it.genreIds = it.genres.map(g => Number(g.id ?? g));
        it.hVector = graph.vectorizeKeywords(ocean.keywordsOf(it));
        items.set(`${it.type}:${it.id}`, it);
    }
    console.log(`titoli nel pool proxy: ${items.size}`);
    { const sz = [...items.values()].map(i => Object.keys(i.hVector).length).sort((a,b)=>a-b); console.log(`  chiavi del vettore gerarchico per item: mediana ${sz[sz.length>>1]} · max ${sz[sz.length-1]}  <- la prova che l iniezione e viva`); }
    // carico anche gli item dei trial fuori dal pool (i visti)
    const missing = [...keys].filter(k => !items.has(k));
    if (missing.length) {
        const byType = { movie: [], tv: [] };
        for (const k of missing) { const [t, id] = k.split(':'); byType[t].push(Number(id)); }
        for (const [t, ids] of Object.entries(byType)) {
            const table = t === 'movie' ? 'movies' : 'tv';
            const col = t === 'movie' ? 'title' : 'name';
            for (let i = 0; i < ids.length; i += 400) {
                const chunk = ids.slice(i, i + 400);
                const rs = await all(db, `SELECT id, ${col} AS name, genres, keywords, vote_count FROM read_parquet('${PARDIR}/${table}.parquet') WHERE id IN (${chunk.join(',')})`);
                for (const r of rs) {
                    const it = { type: t, id: Number(r.id), name: r.name, genres: parse(r.genres) || [], keywords: parse(r.keywords) || [] };
                    it.genreIds = it.genres.map(g => Number(g.id ?? g));
                    it.hVector = graph.vectorizeKeywords(ocean.keywordsOf(it));
                    items.set(`${t}:${it.id}`, it);
                }
            }
        }
    }
    console.log(`titoli totali con metadati: ${items.size}`);

    const productionProfile = seeds => {
        const raw = {};
        for (const item of seeds) {
            const kws = ocean.keywordsOf(item);
            const vec = dna.extractActiveDNAFromTmdbData({ genre_ids: item.genreIds, origin_country: [], keywords: { results: kws }, keyword_ids: kws.map(k => String(k.id)) }, 100);
            for (const [k, v] of Object.entries(vec)) raw[k] = (raw[k] || 0) + v;
        }
        return dna.computeFinalDNA({}, dna.computeActiveDNA(raw), seeds.length * 3);
    };
    const recall = (order, gold, n) => { if (!gold.length) return null; const top = new Set(order.slice(0, n)); return gold.filter(g => top.has(g)).length / gold.length; };
    const rank = (cands, profile) => cands.map(k => {
        const it = items.get(k);
        return { k, s: it ? ProfileScorer._computeThematicScoreForVector(profile, it.genreIds, it.hVector) : -1 };
    }).sort((a, b) => (b.s - a.s) || a.k.localeCompare(b.k)).map(x => x.k);
    const rankByPopularity = cands => cands.map(k => ({ k, s: items.get(k)?.voteCount || 0 })).sort((a, b) => b.s - a.s).map(x => x.k);

    /**
     * IL POOL VERO: replica la logica di `fetchSmartAndPool` —
     * (uno dei top-3 generi del profilo) E (una keyword dei cluster dei top-3 nodi L2),
     * con i nodi L2 espansi a keyword dal grafo. Il proxy "generi condivisi" era troppo largo.
     */
    const realPool = (profileVector, exclude) => {
        const genres = Object.entries(profileVector).filter(([k]) => k.startsWith('g:'))
            .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => Number(k.slice(2)));
        const l2 = Object.entries(profileVector).filter(([k]) => k.startsWith('L2:'))
            .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k.slice(3));
        let kwIds = new Set();
        if (l2.length > 0) {
            const map = graph.getKeywordsForNodes(l2, 'L2');
            for (const kws of map.values()) for (const kw of kws) if (/^\d+$/.test(String(kw))) kwIds.add(Number(kw));
        }
        if (kwIds.size === 0) {
            const topKw = Object.entries(profileVector).filter(([k]) => k.startsWith('k:'))
                .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => Number(k.slice(2))).filter(Number.isFinite);
            kwIds = new Set(topKw);
        }
        return [...items.keys()].filter(k => {
            if (exclude.has(k)) return false;
            const it = items.get(k);
            if (!it) return false;
            const genreOk = genres.length === 0 || it.genreIds.some(g => genres.includes(g));
            if (!genreOk) return false;
            if (kwIds.size === 0) return true;
            return ocean.keywordsOf(it).some(x => kwIds.has(Number(x.id)));
        });
    };

    let seedState = 4242;
    const rnd = () => { seedState = (seedState * 1103515245 + 12345) % 2147483648; return seedState / 2147483648; };
    const sample = (arr, n) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

    const rowsOut = [];
    for (const t of trials) {
        const seeds = t.seeds.map(k => items.get(k)).filter(Boolean);
        if (seeds.length < 2) continue;
        const profile = productionProfile(seeds);
        const gold = t.gold.filter(k => items.has(k));
        if (!gold.length) continue;
        const seedKeys = new Set(t.seeds);
        const pool = [...items.keys()].filter(k => !seedKeys.has(k));                     // il pool proxy attuale
        const genrePool = pool.filter(k => {
            const it = items.get(k);
            return seeds.some(s => s.genreIds.some(g => it.genreIds.includes(g)));
        });
        const sets = {
            'graph 1 hop': t.onehop.filter(k => !seedKeys.has(k)),
            'graph 2 hop': t.twohop.filter(k => !seedKeys.has(k)),
            'graph cluster+vicini': t.cluster.filter(k => !seedKeys.has(k)),
            'POOL VERO (fetchSmartAndPool)': realPool(profile, seedKeys),
            'pool proxy (generi condivisi)': genrePool,
            'CASO = |2 hop| dal pool vero': null,
            'CASO = |2 hop| dal proxy': sample(genrePool, t.twohop.length),
            'CASO = |1 hop| dal pool vero': null
        };
        const vero = sets['POOL VERO (fetchSmartAndPool)'];
        sets['CASO = |2 hop| dal pool vero'] = sample(vero, t.twohop.length);
        sets['CASO = |1 hop| dal pool vero'] = sample(vero, t.onehop.length);
        for (const [name, cands] of Object.entries(sets)) {
            const order = rank(cands, profile);
            const popOrder = rankByPopularity(cands);
            rowsOut.push({ ctx: t.ctx, source: name, size: cands.length,
                r50: recall(order, gold, 50), r200: recall(order, gold, 200),
                pop50: recall(popOrder, gold, 50),
                medVotes: median(cands.map(k => items.get(k)?.voteCount || 0)),
                popWins: cands.filter(k => (items.get(k)?.voteCount || 0) >= 1000).length / Math.max(1, cands.length) });
        }
    }

    const bySource = new Map();
    for (const r of rowsOut) {
        if (!bySource.has(r.source)) bySource.set(r.source, []);
        bySource.get(r.source).push(r);
    }
    console.log(`\n== IL GRAFO DAVANTI ALLO SCORER, A PARITA' DI BUDGET (${trials.length} trial, 5 profili reali) ==\n`);
    console.log('| sorgente di candidati | candidati (mediana) | recall@50 | recall@200 | se ordinassi per POPOLARITÀ | voti mediani | ≥1000 voti |');
    console.log('|---|---|---|---|---|---|---|');
    for (const name of ['graph 1 hop', 'CASO = |1 hop| dal pool vero', 'graph 2 hop', 'CASO = |2 hop| dal pool vero', 'graph cluster+vicini', 'POOL VERO (fetchSmartAndPool)', , 'pool proxy (generi condivisi)']) {
        const g = bySource.get(name);
        if (!g) continue;
        const p = n => `${(100 * mean(g.map(r => r[n]).filter(v => v !== null))).toFixed(1)}%`;
        console.log(`| ${name} | ${median(g.map(r => r.size))} | ${p('r50')} | ${p('r200')} | ${p('pop50')} | ${median(g.map(r => r.medVotes))} | ${(100 * mean(g.map(r => r.popWins))).toFixed(0)}% |`);
    }
    db.close();
    process.exit(0);
})().catch(e => { console.error('ERRORE:', e.message, e.stack?.split('\n')[1]); process.exit(1); });
