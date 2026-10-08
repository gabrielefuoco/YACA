/**
 * .scratch/ml-collaborativo/teacher-feasibility.js
 *
 * Quanto "teacher" c'è davvero? Quanti item coperti da MovieLens hanno abbastanza
 * voti per entrare nella matrice di co-visione, e quanti dei NOSTRI titoli
 * rientrano in quelle fasce? Include il controllo di popolarità: se la matrice
 * è dominata dai blockbuster, il teacher insegna "popolare", non "gusto".
 *
 * Uso: node .scratch/ml-collaborativo/teacher-feasibility.js
 */
const fs = require('fs');
const path = require('path');
const duckdb = require('duckdb');
const ML = path.join(__dirname, '../../.cache/movielens/ml-32m').split(String.fromCharCode(92)).join('/');
const PQ = path.join(__dirname, '../../.cache/tmdb').split(String.fromCharCode(92)).join('/');
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));

(async () => {
    const db = new duckdb.Database(':memory:');
    await all(db, `CREATE VIEW ratings AS SELECT * FROM read_csv_auto('${ML}/ratings.csv')`);
    await all(db, `CREATE VIEW links AS SELECT movieId, CAST(tmdbId AS BIGINT) AS tmdb FROM read_csv_auto('${ML}/links.csv')`);
    await all(db, `CREATE VIEW movies AS SELECT CAST(id AS BIGINT) AS id, title, vote_count, popularity, release_date FROM read_parquet('${PQ}/movies.parquet')`);

    const tot = (await all(db, `SELECT count(*) AS r, count(DISTINCT userId) AS u, count(DISTINCT movieId) AS m FROM ratings`))[0];
    console.log(`MovieLens ml-32m: ${tot.r} voti · ${tot.u} utenti · ${tot.m} film votati`);

    const rows = await all(db, `
        WITH per_item AS (SELECT movieId, count(*) AS votes FROM ratings GROUP BY movieId)
        SELECT
            sum(CASE WHEN votes >= 20 THEN 1 ELSE 0 END) AS g20,
            sum(CASE WHEN votes >= 50 THEN 1 ELSE 0 END) AS g50,
            sum(CASE WHEN votes >= 200 THEN 1 ELSE 0 END) AS g200,
            sum(CASE WHEN votes >= 1000 THEN 1 ELSE 0 END) AS g1000,
            count(*) AS tutti
        FROM per_item`);
    const r = rows[0];
    console.log(`\nfilm con almeno: 20 voti ${r.g20} · 50 ${r.g50} · 200 ${r.g200} · 1000 ${r.g1000} (su ${r.tutti} votati)`);

    const ours = await all(db, `
        WITH per_item AS (SELECT movieId, count(*) AS votes FROM ratings GROUP BY movieId)
        SELECT m.id, m.vote_count, p.votes AS ml_votes
        FROM movies m JOIN links l ON l.tmdb = m.id JOIN per_item p ON p.movieId = l.movieId`);
    const bands = [['>=20 voti ML', 20], ['>=50', 50], ['>=200', 200], ['>=1000', 1000]];
    console.log(`\n| fascia | nostri film coperti | di cui popolari nel nostro catalogo (>=1000 voti TMDB) | mediana voti TMDB |`);
    console.log(`|---|---|---|---|`);
    for (const [label, min] of bands) {
        const sel = ours.filter(o => Number(o.ml_votes) >= min);
        const popolari = sel.filter(o => Number(o.vote_count) >= 1000).length;
        const mediane = sel.map(o => Number(o.vote_count)).sort((a, b) => a - b);
        const med = mediane.length ? mediane[Math.floor(mediane.length / 2)] : 0;
        console.log(`| ${label} | ${sel.length} | ${popolari} (${(100 * popolari / sel.length).toFixed(0)}%) | ${med} |`);
    }

    // Quanti dei NOSTRI film molto popolari restano fuori dal teacher?
    const nostril = await all(db, `SELECT id, vote_count FROM movies WHERE vote_count >= 1000`);
    const coveredSet = new Set(ours.map(o => Number(o.id)));
    const conTeacher = nostril.filter(m => coveredSet.has(Number(m.id))).length;
    console.log(`\nnostri film con >=1000 voti: ${nostril.length} · con teacher MovieLens: ${conTeacher} (${(100 * conTeacher / nostril.length).toFixed(1)}%) · senza: ${nostril.length - conTeacher}`);
    db.close();
})();
