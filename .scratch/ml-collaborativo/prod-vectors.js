/** I VETTORI DI PRODUZIONE: la similarità per keyword che gira oggi in src/, calcolata su tutto il
 *  catalogo e salvata per misurarla sul set curato. Uso: node .scratch/ml-collaborativo/prod-vectors.js */
const fs = require('fs'), path = require('path'), duckdb = require('duckdb');
const graph = require('../../src/engines/graph/HierarchicalGraph');
const ocean = require('../ocean-prototipo/ocean-core.js');
const PARDIR = path.join(__dirname, '../../.cache/tmdb').split(String.fromCharCode(92)).join('/');
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));
const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
(async () => {
    await require('../livello-latente/bootstrap-map.js')();
    const db = new duckdb.Database(':memory:');
    const rows = [
        ...(await all(db, `SELECT id, title AS name, genres, keywords FROM read_parquet('${PARDIR}/movies.parquet')`)).map(r => ({ ...r, type: 'movie' })),
        ...(await all(db, `SELECT id, name, genres, keywords FROM read_parquet('${PARDIR}/tv.parquet')`)).map(r => ({ ...r, type: 'tv' }))
    ];
    const keys = new Map(); const R = [], C = [], V = []; const outKeys = [];
    for (const r of rows) {
        const it = { type: r.type, id: Number(r.id), name: r.name, genres: parse(r.genres) || [], keywords: parse(r.keywords) || [] };
        it.genreIds = it.genres.map(g => Number(g.id ?? g));
        const vec = graph.vectorizeKeywords(ocean.keywordsOf(it));
        const kk = `${it.type}:${it.id}`; outKeys.push(kk);
        const row = outKeys.length - 1;
        for (const [k, v] of Object.entries(vec)) {
            if (!keys.has(k)) keys.set(k, keys.size);
            R.push(row); C.push(keys.get(k)); V.push(v);
        }
    }
    fs.writeFileSync(path.join(__dirname, '../../.cache/movielens/prod-vectors.json'),
        JSON.stringify({ keys: outKeys, tokens: [...keys.keys()], rows: R, cols: C, vals: V }));
    console.log(`vettori di produzione: ${outKeys.length} titoli · ${keys.size} token · ${R.length} valori`);
    db.close(); process.exit(0);
})().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
