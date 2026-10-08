/**
 * .scratch/ocean-prototipo/sim-differenziazione.js   —  PROTOTIPO
 *
 * LA DOMANDA DELL'UTENTE, misurata: «i suggerimenti risultano inutili, sono quasi
 * simili ai profili che ci sono». Quanto si somigliano DAVVERO le liste di profili
 * diversi — e da dove viene (o non viene) la differenza?
 *
 * Metodo: i 5 profili reali (V_final da Atlas, sola lettura) ordinano lo STESSO pool
 * di titoli (film + serie dal parquet). Si confrontano le top-50 a coppie.
 * Tre varianti di punteggio, per capire dove vive la personalizzazione:
 *   - completo   (generi + keyword + gerarchia, come fa lo scorer)
 *   - solo generi
 *   - solo keyword e gerarchia
 *
 * In più: contaminazione, cioè quanti titoli «fuori tema» entrano nella top-50
 * (animazione/bambini in un profilo adulto, live-action in un profilo anime, ecc.).
 *
 * Uso: node .scratch/ocean-prototipo/sim-differenziazione.js
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const duckdb = require('duckdb');
const ocean = require('./ocean-core.js');
const graph = require('../../src/engines/graph/HierarchicalGraph');
const ProfileScorer = require('../../src/profile/ProfileScorer.js');
const { connectMongo } = require('../../src/utils/mongoConnect');

const PARQUET_DIR = path.join(__dirname, '../../.cache/tmdb').split(String.fromCharCode(92)).join('/');
const TOP_N = 50;
const MOVIES = 3000;
const SERIES = 1500;

const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const ANIME = 16;              // genere Animazione
const FAMILY = 10751;          // genere Famiglia
const KIDS_GENRES = new Set([16, 10751, 10762]);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const jaccard = (a, b) => {
    const A = new Set(a), B = new Set(b);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter += 1;
    const union = new Set([...A, ...B]).size;
    return union ? inter / union : 1;
};

const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));

(async () => {
    await require('../livello-latente/bootstrap-map.js')();
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const dbm = mongoose.connection.db;
    const profiles = await dbm.collection('tasteprofiles')
        .find({}).project({ owner: 1, context: 1, 'compiledVectors.V_final': 1, 'compiledVectors.V_clusters': 1 }).toArray();

    const db = new duckdb.Database(':memory:');
    const movies = (await all(db, `SELECT id, title AS name, genres, keywords, popularity, runtime, vote_count, release_date FROM read_parquet('${PARQUET_DIR}/movies.parquet') ORDER BY popularity DESC LIMIT ${MOVIES}`))
        .map(r => ({ id: Number(r.id), type: 'movie', name: r.name, genres: parse(r.genres) || [], keywords: parse(r.keywords) || [], runtime: Number(r.runtime) || null, year: Number(String(r.release_date || '').slice(0, 4)) || null }));
    const series = (await all(db, `SELECT id, name, genres, keywords, popularity, vote_count, first_air_date FROM read_parquet('${PARQUET_DIR}/tv.parquet') ORDER BY popularity DESC LIMIT ${SERIES}`))
        .map(r => ({ id: Number(r.id), type: 'tv', name: r.name, genres: parse(r.genres) || [], keywords: parse(r.keywords) || [], runtime: null, year: Number(String(r.first_air_date || '').slice(0, 4)) || null }));

    // Pool unico, id prefissato per tipo (film e serie possono condividere l'id numerico).
    const pool = [...movies, ...series].map(i => ({ ...i, key: `${i.type}:${i.id}`, genreIds: i.genres.map(g => Number(g.id ?? g)) }));
    const prepared = pool.map(i => ({ ...i, hVector: graph.vectorizeKeywords(ocean.keywordsOf(i)) }));

    const profileData = profiles.map(p => {
        const vFinal = ProfileScorer.normalizeDna ? ProfileScorer.normalizeDna(p.compiledVectors?.V_final) : (p.compiledVectors?.V_final || {});
        const topGenres = Object.entries(vFinal).filter(([k]) => k.startsWith('g:')).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => Number(k.slice(2)));
        const topL2 = Object.entries(vFinal).filter(([k]) => k.startsWith('L2:')).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
        return { label: `${p.owner.slice(0, 6)}…/${p.context}`, vFinal, topGenres, topL2 };
    });

    const score = (vector, item, mode) => {
        let total = 0;
        if (mode !== 'kw') {
            for (const gid of item.genreIds) {
                const v = vector[`g:${gid}`];
                if (v) total += v;
            }
        }
        if (mode !== 'genre') {
            for (const [key, weight] of Object.entries(item.hVector)) {
                const v = vector[key];
                if (v) total += v * weight;
            }
        }
        return total;
    };

    const lists = new Map();     // mode -> profilo -> top-N key
    for (const mode of ['full', 'genre', 'kw']) {
        lists.set(mode, profileData.map(pd => {
            const scored = prepared
                .map(item => ({ key: item.key, score: score(pd.vFinal, item, mode) }))
                .sort((a, b) => (b.score - a.score) || a.key.localeCompare(b.key));
            return { label: pd.label, keys: scored.slice(0, TOP_N).map(s => s.key), items: scored.slice(0, TOP_N).map(s => prepared.find(i => i.key === s.key)) };
        }));
    }

    console.log('\n=============== 1. QUANTO SI SOMIGLIANO LE LISTE FRA PROFILI DIVERSI ===============\n');
    const names = profileData.map(p => p.label);
    for (const mode of ['full', 'genre', 'kw']) {
        const L = lists.get(mode);
        const pairs = [];
        for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) pairs.push(jaccard(L[i].keys, L[j].keys));
        console.log(`punteggio ${mode.padEnd(6)} → Jaccard top-50 fra coppie di profili: media ${(100 * mean(pairs)).toFixed(1)}% · min ${(100 * Math.min(...pairs)).toFixed(0)}% · max ${(100 * Math.max(...pairs)).toFixed(0)}%`);
    }
    console.log('\nDettaglio «completo» (coppia per coppia):');
    const full = lists.get('full');
    console.log('| profilo A | profilo B | Jaccard top-50 |');
    console.log('|---|---|---|');
    for (let i = 0; i < full.length; i++) for (let j = i + 1; j < full.length; j++) {
        console.log(`| ${names[i]} | ${names[j]} | ${(100 * jaccard(full[i].keys, full[j].keys)).toFixed(1)}% |`);
    }

    console.log('\n=============== 2. QUANTO LA LISTA RISPETTA IL TEMA DEL PROFILO ===============\n');
    console.log('| profilo | generi top | di cui dal proprio genere (%) | di cui dal proprio L2 (%) | item per bambini | item anime |');
    console.log('|---|---|---|---|---|---|');
    for (const entry of full) {
        const pd = profileData.find(p => p.label === entry.label);
        const inGenre = entry.items.filter(i => i.genreIds.some(g => pd.topGenres.includes(g))).length;
        const inL2 = entry.items.filter(i => Object.keys(i.hVector).some(k => pd.topL2.includes(k))).length;
        const kids = entry.items.filter(i => i.genreIds.some(g => KIDS_GENRES.has(g))).length;
        const anime = entry.items.filter(i => i.genreIds.includes(ANIME)).length;
        console.log(`| ${entry.label} | ${pd.topGenres.join(',')} | ${(100 * inGenre / TOP_N).toFixed(0)}% | ${(100 * inL2 / TOP_N).toFixed(0)}% | ${kids}/${TOP_N} | ${anime}/${TOP_N} |`);
    }

    console.log('\n=============== 3. IL PROFILO SCEGLIE DAVVERO, O PRENDE IL POPOLARE? ===============\n');
    const popular50 = prepared.slice().sort((a, b) => b.popularity - a.popularity).slice(0, TOP_N).map(i => i.key);
    for (const entry of full) {
        console.log(`${entry.label.padEnd(22)} vs 50 più popolari del pool: Jaccard ${(100 * jaccard(entry.keys, popular50)).toFixed(1)}%`);
    }

    await mongoose.disconnect();
})().catch(err => { console.error('ERRORE:', err.message, err.stack ? err.stack.split('\n')[1] : ''); process.exit(1); });
