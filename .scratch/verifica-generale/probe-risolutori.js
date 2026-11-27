/** Cosa diventa un concetto: genere? keyword? e per le serie? */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { creaRisolutori } = require('../../src/ricerca/risolutori');
const { genereDaNome } = require('../../src/ricerca/generi');

(async () => {
    await indice.init();
    const resolutori = await creaRisolutori({ indice });
    const valori = ['horror', 'HORROR', 'horror!', 'thriller', 'azione', 'guerra', 'principesse', 'natalizio'];
    for (const tipo of ['movie', 'series']) {
        for (const v of valori) {
            let concetto, persone, errore = null;
            try { concetto = await resolutori.concetto(v, { tipo }); } catch (e) { errore = e.message; }
            console.log(`${tipo.padEnd(7)} ${v.padEnd(12)} concetto=${JSON.stringify(concetto)}${errore ? ' ERRORE ' + errore : ''}`);
        }
    }
    for (const tipo of ['movie', 'series']) {
        for (const nome of ['horror', 'thriller', 'azione', 'fantasy']) {
            console.log(`genereDaNome(${nome}, ${tipo}) =`, JSON.stringify(genereDaNome(nome, { tipo })));
        }
    }
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
