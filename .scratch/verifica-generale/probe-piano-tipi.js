/** Come si risolve la stessa query per film e per serie (genere contro concetto). */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { creaRisolutori } = require('../../src/ricerca/risolutori');
const { pianifica } = require('../../src/ricerca/pianificatore');

(async () => {
    await indice.init();
    for (const q of ['tema horror', 'tema HORROR', 'tema: horror!', 'genere horror', 'tema principesse']) {
        for (const tipo of ['movie', 'series']) {
            const risolutori = creaRisolutori({ type: tipo, contesto: {} });
            const piano = await pianifica(q, { tipo, risolutori });
            const i = (piano.intenti || [])[0] || {};
            console.log(`${tipo.padEnd(7)} ${q.padEnd(16)} generi=${JSON.stringify(i.generi)} concetti=${JSON.stringify(i.concetti)} testo=${JSON.stringify(i.testo)} motivi=${JSON.stringify(piano.motivi || [])}`);
        }
    }
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
