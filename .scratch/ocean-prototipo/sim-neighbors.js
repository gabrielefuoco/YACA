/**
 * .scratch/ocean-prototipo/sim-neighbors.js   —  PROTOTIPO
 *
 * La prova che si giudica a occhio: dati 5 titoli di partenza molto diversi fra
 * loro, chi trova i vicini migliori — il vettore sparso o lo spazio a 5 assi?
 *
 * Uso: node .scratch/ocean-prototipo/sim-neighbors.js
 */
const path = require('path');
const duckdb = require('duckdb');
const ocean = require('./ocean-core.js');
const graph = require('../../src/engines/graph/HierarchicalGraph');
const { setKeywordNameMaps } = require('../../src/data/keywordIds');

const PARQUET = path.join(__dirname, '../../.cache/tmdb/movies.parquet').split(String.fromCharCode(92)).join('/');

const SEEDS = {
    27205: 'Inception',
    493922: 'Hereditary',
    194: 'Amélie',
    129: 'La città incantata',
    76341: 'Mad Max: Fury Road',
    10749: null // segnaposto: romance generico
};

const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const cosineVec = ocean.cosine;
const cosineSparse = (a, b) => {
    let dot = 0, na = 0, nb = 0;
    for (const [k, v] of Object.entries(a)) { na += v * v; if (b[k]) dot += v * b[k]; }
    for (const v of Object.values(b)) nb += v * v;
    return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
};

const db = new duckdb.Database(':memory:');
// NOTA: il filtro su vote_count si fa in JS — una WHERE su BIGINT in questo driver
// fa morire il processo senza errore utile (verificato il 08/10/2026).
db.all(`SELECT id, title, genres, keywords, vote_count, popularity FROM read_parquet('${PARQUET}')
        ORDER BY popularity DESC LIMIT 8000`, (err, rows) => {
    if (err) { console.error('ERR', err.message); process.exit(1); }
    const items = rows
        .filter(r => Number(r.vote_count) > 300)
        .map(r => ({
            id: Number(r.id), name: r.title, genres: parse(r.genres) || [], keywords: parse(r.keywords) || []
        }));

    // Mappa id->nome: serve al coseno sparso, che è quello che fa lo scorer di produzione.
    const pairs = items.flatMap(i => ocean.keywordsOf(i).filter(k => k && k.name).map(k => [String(k.id), String(k.name).toLowerCase()]));
    setKeywordNameMaps({ idToName: new Map(pairs), nameToId: new Map(pairs.map(([id, n]) => [n, id])) });

    const enriched = items.map(i => ({
        ...i,
        sparse: graph.vectorizeKeywords(ocean.keywordsOf(i)),
        ocean: ocean.itemOcean(i).vector
    }));

    // Assi standardizzati sul campione: è la versione "equa" (quella che alza il recall).
    const meanT = ocean.TRAITS.map((_, i) => mean(enriched.map(e => e.ocean ? e.ocean[i] : 0)));
    const stdT = ocean.TRAITS.map((_, i) => {
        const m = meanT[i];
        const v = mean(enriched.map(e => ((e.ocean ? e.ocean[i] : 0) - m) ** 2));
        return Math.sqrt(v) || 1;
    });
    const z = vec => vec.map((x, i) => (x - meanT[i]) / stdT[i]);

    const top = (seed, scoreOf, n = 8) => enriched
        .filter(e => e.id !== seed.id && e.ocean)
        .map(e => ({ name: e.name, s: scoreOf(seed, e) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, n)
        .map(x => `${x.name} (${x.s.toFixed(2)})`);

    for (const [idStr, label] of Object.entries(SEEDS)) {
        if (!label) continue;
        const seed = enriched.find(e => e.id === Number(idStr));
        if (!seed) { console.log(`\n### ${label}: non trovato`); continue; }
        console.log(`\n### ${label}  —  OCEAN ${ocean.describe(seed.ocean)}`);
        console.log('  VICINI PER VETTORE SPARSO (parole/gerarchia in comune):');
        top(seed, (s, e) => cosineSparse(s.sparse, e.sparse)).forEach(n => console.log(`    · ${n}`));
        console.log('  VICINI PER OCEAN 5 ASSI (standardizzati):');
        top(seed, (s, e) => cosineVec(z(s.ocean), z(e.ocean))).forEach(n => console.log(`    · ${n}`));
    }
});
