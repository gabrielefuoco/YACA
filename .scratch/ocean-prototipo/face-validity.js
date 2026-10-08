/**
 * .scratch/ocean-prototipo/face-validity.js   —  PROTOTIPO
 *
 * Tre domande:
 *  1. I 5 assi dicono qualcosa di sensato su titoli che conosciamo?
 *  2. Quanti titoli del catalogo ottengono un profilo, e gli assi variano o sono piatti?
 *  3. La proiezione a 5 dimensioni CONSERVA la struttura di similarità fra titoli,
 *     o la reinventa? (correlazione di rango fra coseno OCEAN e coseno sparso)
 *
 * Uso: node .scratch/ocean-prototipo/face-validity.js
 */
const path = require('path');
const duckdb = require('duckdb');
const ocean = require('./ocean-core.js');
const graph = require('../../src/engines/graph/HierarchicalGraph');
const { setKeywordNameMaps } = require('../../src/data/keywordIds');

const PARQUET = path.join(__dirname, '../../.cache/tmdb/movies.parquet').replace(/\\/g, '/');
const BACKSLASH = String.fromCharCode(92);

// Titoli scelti per coprire angoli molto diversi del catalogo.
const KNOWN = {
    27205: 'Inception', 238: 'Il Padrino', 862: 'Toy Story', 493922: 'Hereditary',
    62: '2001: Odissea nello spazio', 245891: 'John Wick', 194: 'Il favoloso mondo di Amélie',
    274: 'Il silenzio degli innocenti', 129: 'La città incantata', 115: 'Il grande Lebowski',
    597: 'Titanic', 76341: 'Mad Max: Fury Road', 150540: 'Inside Out',
    7345: 'Il petroliere', 872585: 'Oppenheimer', 550: 'Fight Club',
    385128: 'Fast & Furious 9', 508947: 'Red', 372058: 'Your Name',
    496243: 'Parasite'
};

const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const median = a => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const stdev = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };

/** Correlazione di rango di Spearman. */
function spearman(xs, ys) {
    const rank = arr => {
        const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
        const r = new Array(arr.length);
        idx.forEach(([_, i], pos) => { r[i] = pos + 1; });
        return r;
    };
    const rx = rank(xs), ry = rank(ys);
    const n = xs.length;
    const mx = mean(rx), my = mean(ry);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
        num += (rx[i] - mx) * (ry[i] - my);
        dx += (rx[i] - mx) ** 2;
        dy += (ry[i] - my) ** 2;
    }
    return num / Math.sqrt(dx * dy);
}

const sparsOf = item => graph.vectorizeKeywords(JSON.parse(JSON.stringify(ocean.keywordsOf(item))));
const cosineSparse = (a, b) => {
    let dot = 0, na = 0, nb = 0;
    for (const [k, v] of Object.entries(a)) { na += v * v; if (b[k]) dot += v * b[k]; }
    for (const v of Object.values(b)) nb += v * v;
    return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
};

const db = new duckdb.Database(':memory:');
db.all(`SELECT id, title, genres, keywords, vote_count, popularity FROM read_parquet('${PARQUET}') LIMIT 20000`, (err, all) => {
    if (err) { console.error('ERR', err.message); process.exit(1); }
    const items = all.map(r => ({ id: Number(r.id), title: r.title, genres: parse(r.genres) || [], keywords: parse(r.keywords) || [], popularity: Number(r.popularity), voteCount: Number(r.vote_count) }));

    // La mappa id->nome serve al coseno sparso (l'item passa le keyword a nome, il vettore le conosce entrambe).
    const maps = items.slice(0, 5000).flatMap(i => ocean.keywordsOf(i).filter(k => k && k.name).map(k => [String(k.id), String(k.name).toLowerCase()]));
    setKeywordNameMaps({ idToName: new Map(maps), nameToId: new Map(maps.map(([id, n]) => [n, id])) });

    console.log('\n================ 1. I 5 ASSI SU TITOLI NOTI ================\n');
    console.log('| film | O | C | E | A | N | tinte forti | keyword mappate |');
    console.log('|---|---|---|---|---|---|---|---|');
    for (const [idStr, label] of Object.entries(KNOWN)) {
        const item = items.find(i => i.id === Number(idStr));
        if (!item) { console.log(`| ${label} | — | — | — | — | — | non trovato (id ${idStr}) | |`); continue; }
        const { vector, unmapped } = ocean.itemOcean(item);
        const dist = ocean.itemL4Distribution(item);
        if (!vector) { console.log(`| ${item.title} | — | — | — | — | — | nessun segnale | ${unmapped} |`); continue; }
        console.log(`| ${item.title} | ${vector.map(v => v.toFixed(2)).join(' | ')} | ${ocean.strongest(vector)} | ${dist.mapped}/${dist.mapped + dist.unmapped} |`);
    }

    // ---------- 2. copertura e dispersione ----------
    const sample = items.filter(i => i.voteCount > 20);
    const vectors = [];
    let withVector = 0, withKeywords = 0;
    for (const item of sample) {
        const { vector } = ocean.itemOcean(item);
        if (vector) { withVector += 1; vectors.push(vector); }
        if (ocean.keywordsOf(item).length > 0) withKeywords += 1;
    }
    console.log('\n================ 2. COPERTURA E DISPERSIONE ================\n');
    console.log(`titoli nel campione: ${sample.length} (con keyword: ${withKeywords})`);
    console.log(`con profilo OCEAN: ${withVector} (${(100 * withVector / sample.length).toFixed(1)}%)`);
    console.log(`| | O | C | E | A | N |`);
    console.log(`|---|---|---|---|---|---|`);
    console.log(`| media | ${ocean.TRAITS.map((t, i) => mean(vectors.map(v => v[i])).toFixed(3)).join(' | ')} |`);
    console.log(`| dev.std | ${ocean.TRAITS.map((t, i) => stdev(vectors.map(v => v[i])).toFixed(3)).join(' | ')} |`);

    // ---------- 3. fedeltà della proiezione ----------
    const pool = sample.filter(i => i.voteCount > 200).slice(0, 1200);
    const prepared = pool.map(i => ({ sparse: sparsOf(i), ocean: ocean.itemOcean(i).vector })).filter(p => p.ocean);
    const pairs = [];
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let n = 0; n < 5000; n++) {
        const a = prepared[Math.floor(rnd() * prepared.length)];
        const b = prepared[Math.floor(rnd() * prepared.length)];
        if (a === b) continue;
        pairs.push([ocean.cosine(a.ocean, b.ocean), cosineSparse(a.sparse, b.sparse)]);
    }
    const rho = spearman(pairs.map(p => p[0]), pairs.map(p => p[1]));
    console.log('\n================ 3. LA PROIEZIONE CONSERVA LA STRUTTURA? ================\n');
    console.log(`coppie confrontate: ${pairs.length}`);
    console.log(`Spearman(coseno OCEAN, coseno sparso) = ${rho.toFixed(3)}`);
    console.log(`coseno OCEAN medio: ${mean(pairs.map(p => p[0])).toFixed(3)} · coseno sparso medio: ${mean(pairs.map(p => p[1])).toFixed(3)}`);
    console.log(rho > 0.5
        ? '→ la proiezione CONSERVA in buona parte la struttura: 5 numeri raccontano ciò che il vettore sparso sapeva'
        : (rho > 0.2 ? '→ la proiezione conserva solo in parte: aggiunge e perde qualcosa' : '→ la proiezione è quasi indipendente dal vettore sparso: sono due spazi diversi'));
});
