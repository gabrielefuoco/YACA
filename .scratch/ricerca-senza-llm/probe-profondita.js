/** Quanti titoli ha davvero una richiesta generica? (per sapere dove finisce la guardia) */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');

(async () => {
    await indice.init();
    const { getDuckDbCatalogFromFilters } = require('../../src/indice');
    const casi = [
        ['tema horror (genere 27)', { with_genres: '27' }],
        ['genere commedia (35)', { with_genres: '35' }],
        ['tema commedia, romantica, natalizia', { with_genres: '35|10749', with_keywords: '207317|193048|186933|1441|5570' }]
    ];
    for (const [etichetta, filtri] of casi) {
        const t0 = Date.now();
        const tutti = await getDuckDbCatalogFromFilters(filtri, 'movie', 0, 20000, {});
        console.log(`${etichetta.padEnd(40)} ${String(tutti.length).padStart(6)} titoli  (${Date.now() - t0} ms)`);
    }
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
