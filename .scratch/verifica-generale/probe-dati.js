/** Cosa contiene davvero il dump: generi delle serie, certificazioni, provider. */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');

const conGenere = (id) => `list_contains(list_transform(from_json(genres, '["JSON"]'), j -> json_extract_string(j, '$.id')::INT), ${id})`;

(async () => {
    await indice.init();
    const q = async (sql) => (await indice.queryRaw(sql))[0];

    for (const tabella of ['movies', 'tv']) {
        const tot = Number((await q(`SELECT count(*) AS n FROM ${tabella}`)).n);
        console.log(`--- ${tabella}: ${tot} righe ---`);
        for (const id of [27, 53, 10749, 36, 10402, 37, 35, 18, 9648, 10765, 10759]) {
            const r = await q(`SELECT count(*) AS n FROM ${tabella} WHERE ${conGenere(id)}`);
            const n = Number(r.n);
            if (n > 0) console.log(`  genere ${String(id).padStart(5)}: ${n}`);
        }
        const cert = await q(`SELECT count(*) AS n, count(content_rating) AS pieni FROM ${tabella}`);
        console.log(`  content_rating: ${Number(cert.pieni)}/${Number(cert.n)} valorizzate`);
        const w = await q(`SELECT count(*) AS n, count(watch_providers_it) AS pieni FROM ${tabella}`);
        console.log(`  watch_providers_it: ${Number(w.pieni)}/${Number(w.n)} valorizzate`);
        const esempiCert = await indice.queryRaw(`SELECT content_rating, count(*) AS n FROM ${tabella} WHERE content_rating IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 8`);
        console.log('  certificazioni più frequenti:', esempiCert.map(r => `${r.content_rating}=${Number(r.n)}`).join(' '));
    }

    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
