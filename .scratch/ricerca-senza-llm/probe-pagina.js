/** Quanto costa una pagina più grande? Misura 12 richieste a 20 e a 60 sulla stessa query. */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { cercaUnificata } = require('../../src/ricerca/ricercaUnificata');

const CASI = [
    ['tema horror', 'movie'], ['tema natale', 'movie'], ['tema guerra', 'movie'],
    ['cast leonardo dicaprio', 'movie'], ['regista nolan', 'movie'],
    ['anno 1990-1999 genere commedia', 'movie'], ['tema zombie', 'movie'],
    ['genere documentario', 'movie'], ['anime tema isekai', 'series'],
    ['simili interstellar', 'movie'], ['simili batman', 'movie'], ['batman', 'movie']
];

(async () => {
    await indice.init();
    // riscaldamento: FTS, df cache, indice dei semi
    await cercaUnificata({ q: 'tema horror', type: 'movie', skip: 0 });
    await cercaUnificata({ q: 'batman', type: 'movie', skip: 0 });

    for (const [q, type] of CASI) {
        const righe = [`${JSON.stringify(q).padEnd(34)} ${type.padEnd(7)}`];
        for (const skip of [0, 20]) {
            const t0 = Date.now();
            const items = await cercaUnificata({ q, type, skip, activeProfileSettings: {} });
            righe.push(`skip=${String(skip).padEnd(3)} ${String(items.length).padEnd(3)} titoli ${String(Date.now() - t0).padStart(4)} ms`);
        }
        // profondità: quanti titoli ha davvero l'indice per questa query (finestra larga)
        console.log(righe.join(' | '));
    }
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
