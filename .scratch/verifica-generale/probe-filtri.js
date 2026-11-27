/** I filtri che il compilatore produce davvero, per i casi sospetti. */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { creaRisolutori } = require('../../src/ricerca/risolutori');
const { pianifica } = require('../../src/ricerca/pianificatore');
const { compilaIntenti } = require('../../src/ricerca/compilatore');

(async () => {
    await indice.init();
    const casi = [
        ['voto < 7', 'movie'], ['voto > 7', 'movie'], ['voto 7', 'movie'],
        ['durata < 90', 'movie'], ['durata 90-120', 'movie'],
        ['eta 0-6', 'movie'], ['eta T', 'movie'],
        ['genere horror', 'series'], ['genere horror', 'movie'],
        ['tema horror', 'series'], ['tema HORROR', 'series']
    ];
    for (const [q, tipo] of casi) {
        const risolutori = creaRisolutori({ type: tipo, contesto: {} });
        const piano = await pianifica(q, { tipo, risolutori });
        const c = compilaIntenti(piano.intenti || [], { type: tipo });
        console.log(`${tipo.padEnd(7)} ${q.padEnd(16)} filtri=${JSON.stringify(c.piani?.[0]?.filtri)} motivi=${JSON.stringify([...(piano.motivi || []), ...(c.motivi || [])])}`);
    }

    const k = await indice.queryRaw(`SELECT count(*) AS n FROM tv WHERE lower(keywords) LIKE '%horror%'`);
    const k2 = await indice.queryRaw(`SELECT count(*) AS n FROM tv WHERE lower(keywords) LIKE '%thriller%'`);
    console.log(`tv con la parola horror nei keyword: ${Number(k[0].n)} · thriller: ${Number(k2[0].n)}`);
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
