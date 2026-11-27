/**
 * Le sorelle del cluster L1 sono davvero parenti dell'ancora? Conteggi e sovrapposizione.
 *   node .scratch/ricerca-senza-llm/probe-affinita.js
 */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');

const NOMI = "list_transform(from_json(keywords, '[\"JSON\"]'), j -> json_extract_string(j, '$.name'))";
const apice = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function insieme(nome) {
    const sql = `
        SELECT ${NOMI} AS k, id, 'movie' AS m FROM movies WHERE keywords IS NOT NULL
        UNION ALL
        SELECT ${NOMI} AS k, id, 'tv' AS m FROM tv WHERE keywords IS NOT NULL
    `;
    const righe = await indice.queryRaw(`SELECT count(*) AS n FROM (${sql}) WHERE list_contains(k, ${apice(nome)})`);
    return Number(righe[0].n);
}

async function sovrapposizione(a, b) {
    const sql = `
        SELECT count(*) AS n FROM (
            SELECT id, 'movie' AS m, ${NOMI} AS k FROM movies WHERE keywords IS NOT NULL
            UNION ALL
            SELECT id, 'tv' AS m, ${NOMI} AS k FROM tv WHERE keywords IS NOT NULL
        ) WHERE list_contains(k, ${apice(a)}) AND list_contains(k, ${apice(b)})
    `;
    const righe = await indice.queryRaw(sql);
    return Number(righe[0].n);
}

(async () => {
    await indice.init();
    const casi = [
        ['princess', ['fairy', 'enchant', 'fairy godmother', 'prince']],
        ['mecha', ['giant robot', 'gundam', 'piloted robot', 'super robot']],
        ['ship', ['sea voyage', 'cargo ship', 'cruise']],
        ['horror', ['holiday horror', 'christmas horror']],
        ['isekai', ['urban fantasy', 'race against time', 'underground']]
    ];

    for (const [ancora, sorelle] of casi) {
        const totAncora = await insieme(ancora);
        console.log(`\n${ancora}: ${totAncora} titoli`);
        for (const s of sorelle) {
            const totSorella = await insieme(s);
            const comuni = await sovrapposizione(ancora, s);
            const contenimento = totSorella ? (comuni / totSorella) : 0;
            console.log(`   ${s.padEnd(18)} titoli=${String(totSorella).padEnd(6)} comuni=${String(comuni).padEnd(5)} contenimento=${(contenimento * 100).toFixed(0)}%`);
        }
    }
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
