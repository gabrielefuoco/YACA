/** Quanto costa in RAM l'indice dei semi, e quanto tempo ci mette a caricarsi. */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');
const { risolviSeme } = require('../../src/ricerca/semiTitoli');

(async () => {
  await indice.init();
  if (global.gc) global.gc();
  const prima = process.memoryUsage().heapUsed;
  const t0 = Date.now();
  await risolviSeme('padrino', { type: 'movie' });
  const ms = Date.now() - t0;
  if (global.gc) global.gc();
  const dopo = process.memoryUsage().heapUsed;
  console.log(`film: ${ms} ms, heap +${Math.round((dopo - prima) / 1048576)} MB`);
  const t1 = Date.now();
  await risolviSeme('trono di spade', { type: 'series' });
  console.log(`serie: ${Date.now() - t1} ms`);
  await indice.close?.();
  process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
