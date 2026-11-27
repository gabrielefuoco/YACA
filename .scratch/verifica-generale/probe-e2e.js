/** Giro locale fine a fine: cosa restituisce una query, e perché (motivi). */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { cercaUnificata } = require('../../src/ricerca');

const CASI = [
    ['eta T', 'movie'], ['eta vm14', 'movie'], ['eta 0-6', 'movie'], ['eta 18+', 'movie'],
    ['su netflix', 'movie'], ['su netflix', 'series'],
    ['voto 7', 'movie'], ['voto 7-9', 'movie'],
    ['durata 90-120', 'movie'],
    ['genere horror', 'movie'], ['genere horror', 'series'], ['genere thriller', 'series'],
    ['genere commedia', 'series'], ['tema horror', 'series'], ['tema HORROR', 'series'],
    ['tema animali', 'series'], ['regista nolan', 'movie'], ['regista nolan', 'series'],
    ['paese italia', 'movie'], ['lingua italiano', 'movie'], ['anime', 'movie']
];

(async () => {
    await indice.init();
    for (const [q, tipo] of CASI) {
        const t0 = Date.now();
        let items = [], motivi = [], errore = null;
        try {
            const esito = await cercaUnificata({ q, type: tipo, skip: 0 });
            if (Array.isArray(esito)) items = esito; else { items = esito.items || []; motivi = esito.motivi || []; }
        } catch (e) { errore = e.message; }
        const primi = items.slice(0, 3).map(i => i.name || i.title).filter(Boolean).join(' · ');
        console.log(`${tipo.padEnd(7)} ${q.padEnd(18)} ${String(items.length).padStart(3)} titoli ${String(Date.now() - t0 + 'ms').padStart(7)}${motivi.length ? ' motivi=' + JSON.stringify(motivi) : ''}${errore ? ' ERRORE ' + errore : ''}${primi ? ' — ' + primi : ''}`);
    }
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
