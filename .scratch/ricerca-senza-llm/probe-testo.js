/** Perche' la ricerca per testo resta vuota su titoli scritti normalmente? */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { cercaUnificata } = require('../../src/ricerca/ricercaUnificata');
const { risolviSeme } = require('../../src/ricerca/semiTitoli');

(async () => {
    await indice.init();
    const casi = [
        ['spiderman', 'movie'], ['spiderman no way home', 'movie'], ['pokemon', 'movie'],
        ['schindlers list', 'movie'], ['la citta incantata', 'movie'], ['your name', 'movie'],
        ['batmn', 'movie'], ['interstelar', 'movie'], ['padrimo', 'movie'], ['guere stellari', 'movie'],
        ['strangers things', 'series'], ['anime genere fantasy', 'series'], ['batman', 'movie']
    ];
    for (const [q, type] of casi) {
        const items = await cercaUnificata({ q, type, skip: 0, activeProfileSettings: {} });
        const seme = type === 'movie' || type === 'series' ? await risolviSeme(q, { type }) : null;
        console.log(`${JSON.stringify(q).padEnd(26)} ${type.padEnd(7)} risultati=${String(items.length).padEnd(3)} semiTitoli=${JSON.stringify(seme)}  primi=${items.slice(0, 2).map(i => String(i.name).slice(0, 26)).join(' · ')}`);
    }
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
