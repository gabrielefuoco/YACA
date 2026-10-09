/** fetch-trakt-bulk.js — I "related" di Trakt su SCALA, con cache. E' il segnale curatorio/comportamentale
 *  che abbiamo misurato 4 volte piu' vicino al nostro set curato della co-visione MovieLens.
 *  Uso: N=3000 MEDIA=movie node .scratch/ml-collaborativo/fetch-trakt-bulk.js */
const fs = require('fs'), path = require('path'), duckdb = require('duckdb');
require('dotenv').config({ quiet: true });
const CACHE = path.join(__dirname, '../../.cache/trakt');
const PARDIR = path.join(__dirname, '../../.cache/tmdb').split(String.fromCharCode(92)).join('/');
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));
const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    const key = process.env.TRAKT_CLIENT_ID;
    if (!key) throw new Error('TRAKT_CLIENT_ID mancante');
    fs.mkdirSync(CACHE, { recursive: true });
    const N = Number(process.env.N || 3000);
    const MEDIA = process.env.MEDIA || 'movie';
    const db = new duckdb.Database(':memory:');
    const sql = MEDIA === 'movie'
        ? `SELECT id, title AS name, imdb_id, vote_count, genres FROM read_parquet('${PARDIR}/movies.parquet') WHERE imdb_id IS NOT NULL ORDER BY vote_count DESC LIMIT ${N}`
        : `SELECT id, name, imdb_id, vote_count, genres FROM read_parquet('${PARDIR}/tv.parquet') WHERE imdb_id IS NOT NULL ORDER BY vote_count DESC LIMIT ${N}`;
    const rows = await all(db, sql);
    const PREFIX = MEDIA === 'movie' ? 'rel-movie-' : 'rel-tv-';
    let done = 0, cached = 0, empty = 0, err = 0, calls = 0;
    for (const s of rows) {
        const file = path.join(CACHE, `${PREFIX}${s.imdb_id}.json`);
        if (fs.existsSync(file)) { cached++; continue; }
        const url = `https://api.trakt.tv/${MEDIA === 'movie' ? 'movies' : 'shows'}/${s.imdb_id}/related?limit=30&extended=full`;
        try {
            const res = await fetch(url, { headers: { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': key, 'User-Agent': 'yaca-bulk/1.0' } });
            calls++;
            if (res.status === 429) { console.log('RATE LIMIT: attendo 60s'); await sleep(60000); continue; }
            if (!res.ok) { err++; await sleep(300); continue; }
            const rel = await res.json();
            if (!rel.length) empty++;
            fs.writeFileSync(file, JSON.stringify(rel));
            done++;
            if (done % 200 === 0) console.log(`  ${done} scaricati · ${cached} in cache · ${empty} vuoti · ${err} errori · ${calls} chiamate`);
            await sleep(350);
        } catch (e) { err++; await sleep(500); }
    }
    console.log(`FINE: ${done} scaricati · ${cached} in cache · ${empty} senza related · ${err} errori · totale ${rows.length}`);
    db.close(); process.exit(0);
})().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
