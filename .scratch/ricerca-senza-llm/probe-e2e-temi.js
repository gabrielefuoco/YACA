require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { cercaUnificata } = require('../../src/ricerca/ricercaUnificata');

(async () => {
  await indice.init();
  for (const [q, type] of [['tema principesse','movie'],['tema principesse','series'],['principesse','movie']]) {
    const t0 = Date.now();
    const items = await cercaUnificata({ q, type, skip: 0, activeProfileSettings: {} });
    console.log(`\n[${type}] "${q}" → ${items.length} in ${Date.now() - t0} ms`);
    console.log('   ' + items.slice(0, 20).map(i => String(i.name).slice(0, 30)).join(' · '));
  }
  await indice.close?.();
  process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
