/** Perche' «tema principesse» porta Harry Potter? Quale keyword lo aggancia? */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');

(async () => {
    await indice.init();
    const { risolviConcetto } = require('../../src/ricerca/risolutori');
    const { keywordIdForName } = require('../../src/indice').keywordIds;
    const { getDuckDbCatalogFromFilters } = require('../../src/indice');

    const espansi = risolviConcetto('principesse');
    console.log('espansione:', JSON.stringify(espansi));

    for (const nome of espansi) {
        const id = keywordIdForName(nome);
        const righe = await getDuckDbCatalogFromFilters({ with_keywords: String(id) }, 'movie', 0, 3000, {});
        const hp = righe.find(r => String(r.id) === 'tmdb:671');
        console.log(`  ${nome.padEnd(16)} id=${String(id).padEnd(8)} titoli=${String(righe.length).padEnd(5)} HarryPotter=${hp ? 'SI' : 'no'}  primi: ${righe.slice(0, 3).map(r => r.name).join(' · ')}`);
    }
    await indice.close?.();
    process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
