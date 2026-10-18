/**
 * fetch-trakt-related.js — la verita' COMPORTAMENTALE per le serie (quella che MovieLens non ha).
 * Per N serie sparse sui generi chiede a Trakt /movies/{id}/related e salva la cache.
 * Uso: N=5 node .scratch/ml-collaborativo/fetch-trakt-related.js
 */
const fs = require('fs'), path = require('path'), duckdb = require('duckdb');
require('dotenv').config({ quiet: true });
const CACHE = path.join(__dirname, '../../../.cache/trakt');
const PARDIR = path.join(__dirname, '../../../.cache/tmdb').split(String.fromCharCode(92)).join('/');
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));
const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const key = process.env.TRAKT_CLIENT_ID;
    if (!key) throw new Error('TRAKT_CLIENT_ID mancante nel .env');
    fs.mkdirSync(CACHE, { recursive: true });
    const N = Number(process.env.N || 5);
    const db = new duckdb.Database(':memory:');
    const rows = await all(db, `SELECT id, title AS name, imdb_id, vote_count, genres, popularity FROM read_parquet('${PARDIR}/movies.parquet') WHERE imdb_id IS NOT NULL AND vote_count > 200 ORDER BY popularity DESC LIMIT 600`);
    // sparse sui generi: round-robin per primo genere
    const buckets = new Map();
    for (const r of rows) {
        const gs = (parse(r.genres) || []).map(g => g.id);
        const k = gs[0] || 0;
        if (!buckets.has(k)) buckets.set(k, []);
        if (buckets.get(k).length < 12) buckets.get(k).push(r);
    }
    const picks = [];
    let i = 0;
    while (picks.length < N && i < 20) {
        for (const arr of buckets.values()) { if (arr[i] && picks.length < N) picks.push(arr[i]); }
        i++;
    }
    console.log(`serie scelte: ${picks.length} · generi coperti: ${new Set(picks.map(p => (parse(p.genres) || [{}])[0].id)).size}`);
    const out = [];
    for (const s of picks) {
        const file = path.join(CACHE, `related-${s.imdb_id}.json`);
        let rel;
        if (fs.existsSync(file)) { rel = JSON.parse(fs.readFileSync(file, 'utf8')); console.log(`  [cache] ${s.name}`); }
        else {
            const url = `https://api.trakt.tv/movies/${s.imdb_id}/related?limit=20&extended=full`;
            const res = await fetch(url, { headers: { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': key, 'User-Agent': 'yaca-probe/1.0' } });
            if (!res.ok) { console.log(`  [ERR ${res.status}] ${s.name}`); await sleep(400); continue; }
            rel = await res.json();
            fs.writeFileSync(file, JSON.stringify(rel));
            await sleep(400);            // rispetto dei limiti
        }
        const names = rel.slice(0, 6).map(x => `${x.title} (${x.year || '?'})`).join(' · ');
        console.log(`  ${s.name} (${s.vote_count} voti) -> ${rel.length} correlate: ${names}`);
        out.push({ id: Number(s.id), name: s.name, imdb: s.imdb_id, related: rel.map(x => ({ ids: x.ids, title: x.title, year: x.year, votes: x.vote_count })) });
    }
    fs.writeFileSync(path.join(CACHE, `related-movies-${N}.json`), JSON.stringify(out, null, 1));
    console.log(`\nscritto .cache/trakt/related-movies-${N}.json (${out.length} serie)`);
    db.close(); process.exit(0);
})().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
