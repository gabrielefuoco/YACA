/** Quanto costa servire TUTTO quello che una richiesta generica trova? */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { cercaUnificata } = require('../../src/ricerca/ricercaUnificata');

const CASI = [
    ['tema commedia, romantica, natalizia', 'movie'],
    ['tema horror', 'movie'],
    ['genere commedia', 'movie'],
    ['anno 1990-1999 genere commedia', 'movie'],
    ['tema guerra', 'movie'],
    ['cast leonardo dicaprio', 'movie'],
    ['simili interstellar', 'movie'],
    ['batman', 'movie']
];

(async () => {
    await indice.init();
    await cercaUnificata({ q: 'tema horror', type: 'movie', skip: 0 });
    for (const [q, type] of CASI) {
        const t0 = Date.now();
        const items = await cercaUnificata({ q, type, skip: 0, activeProfileSettings: {} });
        const ms = Date.now() - t0;
        const kb = Math.round(Buffer.byteLength(JSON.stringify({ metas: items })) / 1024);
        console.log(`${String(items.length).padStart(5)} titoli ${String(ms).padStart(5)} ms  ${String(kb).padStart(6)} KB  ${q}`);
    }
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
