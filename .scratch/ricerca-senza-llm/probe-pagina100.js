/** Costa di più una pagina da 100? Misura le stesse query con la pagina a 60 e a 100. */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');

const CASI = [
    ['tema commedia, romantica, natalizia', 'movie'],
    ['tema horror', 'movie'],
    ['cast leonardo dicaprio', 'movie'],
    ['batman', 'movie'],
    ['simili interstellar', 'movie']
];

(async () => {
    for (const pagina of [60, 100]) {
        process.env.CATALOG_PAGE_SIZE = String(pagina);
        // modulo di configurazione e ricerca freschi per ogni misura
        for (const chiave of Object.keys(require.cache)) {
            if (chiave.includes('/src/')) delete require.cache[chiave];
        }
        const indice = require('../../src/indice');
        const { cercaUnificata } = require('../../src/ricerca/ricercaUnificata');
        await indice.init();
        await cercaUnificata({ q: 'tema horror', type: 'movie', skip: 0 });

        const righe = [];
        for (const [q, type] of CASI) {
            const t0 = Date.now();
            const items = await cercaUnificata({ q, type, skip: 0, activeProfileSettings: {} });
            righe.push(`${String(items.length).padStart(3)} titoli ${String(Date.now() - t0).padStart(5)} ms  ${q}`);
        }
        console.log(`\n=== pagina ${pagina}`);
        for (const riga of righe) console.log('  ' + riga);
        await indice.close?.();
    }
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
