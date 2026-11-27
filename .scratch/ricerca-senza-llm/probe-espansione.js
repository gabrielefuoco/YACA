/**
 * Le sorelle del grafo: quante co-occorrono davvero con l'ancora? E quanto costa chiederlo?
 *   node .scratch/ricerca-senza-llm/probe-espansione.js
 */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');

const NOMI = "list_transform(from_json(keywords, '[\"JSON\"]'), j -> json_extract_string(j, '$.name'))";
const apice = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function conta(ancora, sorella) {
    const sql = `
        SELECT count(*) AS n FROM (
            SELECT ${NOMI} AS k FROM movies WHERE keywords IS NOT NULL
            UNION ALL
            SELECT ${NOMI} AS k FROM tv WHERE keywords IS NOT NULL
        ) WHERE list_contains(k, ${apice(ancora)}) AND list_contains(k, ${apice(sorella)})
    `;
    const righe = await indice.queryRaw(sql);
    return Number(righe[0].n);
}

(async () => {
    await indice.init();
    const coppie = [
        ['isekai', ['seinen', "girls' love (gl)", 'urban fantasy', 'mature']],
        ['mecha', ['giant robot', 'gundam', 'piloted robot', 'super robot']],
        ['ship', ['sea voyage', 'cargo ship', 'cruise']],
        ['horror', ['holiday horror', 'christmas horror']]
    ];
    for (const [ancora, sorelle] of coppie) {
        const t0 = Date.now();
        const conteggi = [];
        for (const s of sorelle) conteggi.push(`${s}=${await conta(ancora, s)}`);
        console.log(`${ancora.padEnd(10)} ${Date.now() - t0} ms → ${conteggi.join('  ')}`);
    }
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
