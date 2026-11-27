/** `voto < 7` restituisce davvero titoli con voto sotto 7? Si guarda il dump, non il codice. */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { cercaUnificata } = require('../../src/ricerca');

(async () => {
    await indice.init();
    for (const q of ['voto < 7', 'voto > 8', 'durata < 90', 'durata > 150']) {
        const items = await cercaUnificata({ q, type: 'movie', skip: 0 });
        const numerici = items.map(i => Number(String(i.id).replace(/^tt/, ''))).filter(Number.isFinite);
        const imdb = items.map(i => i.id).filter(id => String(id).startsWith('tt'));
        const tmdb = items.map(i => Number(String(id = i.id).replace(/^tmdb:/, ''))).filter(n => Number.isFinite(n) && n > 0);
        const condizioni = [];
        if (imdb.length) condizioni.push(`imdb_id IN (${imdb.map(i => `'${i}'`).join(',')})`);
        if (tmdb.length) condizioni.push(`id IN (${tmdb.join(',')})`);
        if (!condizioni.length) { console.log(q, 'nessun id utile'); continue; }
        const righe = await indice.queryRaw(
            `SELECT min(vote_average) AS vmin, max(vote_average) AS vmax, min(runtime) AS dmin, max(runtime) AS dmax, count(*) AS n FROM movies WHERE ${condizioni.join(' OR ')}`
        );
        const r = righe[0];
        console.log(q.padEnd(14), `${items.length} titoli · ${Number(r.n)} trovati nel dump · voto ${Number(r.vmin)}–${Number(r.vmax)} · durata ${Number(r.dmin)}–${Number(r.dmax)}`);
    }
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
