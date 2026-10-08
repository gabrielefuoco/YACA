/**
 * .scratch/ml-collaborativo/coverage.js
 *
 * IL GATE: quanta parte del NOSTRO catalogo è coperta da MovieLens?
 * Senza copertura il "teacher" collaborativo non ha niente da insegnare.
 *
 * Misura: per ogni film del parquet (e per le serie), il tmdbId è in links.csv?
 * Rotte per anno, popolarità e voto — perché la copertura conta dove serve.
 *
 * Uso: node .scratch/ml-collaborativo/coverage.js
 */
const fs = require('fs');
const path = require('path');
const duckdb = require('duckdb');

const ML_LINKS = path.join(__dirname, '../../.cache/movielens/ml-32m/links.csv');
const PARQUET_DIR = path.join(__dirname, '../../.cache/tmdb').split(String.fromCharCode(92)).join('/');
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : 'n/d');

(async () => {
    // tmdbId coperti (film): la colonna tmdbId esiste solo per i film.
    const covered = new Set();
    const rows = fs.readFileSync(ML_LINKS, 'utf8').split('\n').slice(1);
    for (const line of rows) {
        const parts = line.split(',');
        const tmdbId = parts[2] && parts[2].trim();
        if (tmdbId && /^\d+$/.test(tmdbId)) covered.add(Number(tmdbId));
    }
    console.log(`MovieLens ml-32m: ${covered.size} tmdbId di FILM coperti (le serie non esistono in MovieLens)`);

    const db = new duckdb.Database(':memory:');
    const movies = await all(db, `SELECT id, title, release_date, vote_count, popularity FROM read_parquet('${PARQUET_DIR}/movies.parquet')`);
    const tvCount = (await all(db, `SELECT count(*) AS n FROM read_parquet('${PARQUET_DIR}/tv.parquet')`))[0].n;

    const yearOf = d => Number(String(d || '').slice(0, 4)) || 0;
    let hit = 0;
    const bands = { '>=100 voti': [0, 0], '>=1000 voti': [0, 0], '>=10000 voti': [0, 0], '>=100000 voti': [0, 0] };
    const decades = new Map();
    for (const m of movies) {
        const isHit = covered.has(Number(m.id));
        if (isHit) hit += 1;
        const v = Number(m.vote_count) || 0;
        for (const [label, min] of [['>=100 voti', 100], ['>=1000 voti', 1000], ['>=10000 voti', 10000], ['>=100000 voti', 100000]]) {
            if (v >= min) { bands[label][1] += 1; if (isHit) bands[label][0] += 1; }
        }
        const dec = Math.floor(yearOf(m.release_date) / 10) * 10;
        if (!decades.has(dec)) decades.set(dec, [0, 0]);
        decades.get(dec)[1] += 1;
        if (isHit) decades.get(dec)[0] += 1;
    }

    console.log(`\n== FILM ==`);
    console.log(`catalogo: ${movies.length} · coperti: ${hit} (${pct(hit, movies.length)})`);
    console.log(`\n| soglia di voti | film | coperti | copertura |`);
    console.log(`|---|---|---|---|`);
    for (const [label, [h, t]] of Object.entries(bands)) console.log(`| ${label} | ${t} | ${h} | **${pct(h, t)}** |`);
    console.log(`\n| decennio | film | coperti | copertura |`);
    console.log(`|---|---|---|---|`);
    for (const dec of [...decades.keys()].sort((a, b) => a - b)) {
        if (dec === 0 && decades.get(0)[1] === 0) continue;
        const [h, t] = decades.get(dec);
        console.log(`| ${dec === 0 ? 'senza data' : dec + 's'} | ${t} | ${h} | ${pct(h, t)} |`);
    }
    console.log(`\n== SERIE TV ==`);
    console.log(`catalogo: ${tvCount} titoli · coperti da MovieLens: **0** (links.csv rimanda solo a /movie/{id})`);
    db.close();
})();
