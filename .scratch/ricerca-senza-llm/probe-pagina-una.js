/** Una misura sola: la pagina la decide CATALOG_PAGE_SIZE nell'ambiente. */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { cercaUnificata } = require('../../src/ricerca/ricercaUnificata');
const { CATALOG_PAGE_SIZE } = require('../../src/config');

const CASI = [
    ['tema commedia, romantica, natalizia', 'movie'],
    ['tema horror', 'movie'],
    ['cast leonardo dicaprio', 'movie'],
    ['batman', 'movie'],
    ['simili interstellar', 'movie']
];

(async () => {
    await indice.init();
    await cercaUnificata({ q: 'tema horror', type: 'movie', skip: 0 });
    console.log(`=== pagina ${CATALOG_PAGE_SIZE}`);
    for (const [q, type] of CASI) {
        const t0 = Date.now();
        const items = await cercaUnificata({ q, type, skip: 0, activeProfileSettings: {} });
        console.log(`  ${String(items.length).padStart(3)} titoli ${String(Date.now() - t0).padStart(5)} ms  ${q}`);
    }
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
