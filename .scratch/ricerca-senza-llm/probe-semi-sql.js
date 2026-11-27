/**
 * Sonda SQL: si puo' risolvere un seme con una query normalizzata, e quanto costa?
 */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');

const NORM = (col) => `regexp_replace(strip_accents(lower(${col})), '[^a-z0-9]+', ' ', 'g')`;

(async () => {
  await indice.init();

  console.log('--- funzioni disponibili');
  for (const sql of ["SELECT strip_accents('Amélie') AS a", "SELECT regexp_replace('2001: Odissea nello spazio','[^a-z0-9]+',' ','g') AS a"]) {
    try { console.log('  ok', (await indice.queryRaw(sql))[0]); } catch (e) { console.log('  KO', e.message.slice(0, 80)); }
  }

  const semi = ['cavaliere oscuro', 'padrino', 'signore degli anelli', 'odissea', 'inter', 'spiderman', 'amelie', 'pokemon', 'hunger game'];
  for (const q of semi) {
    const t0 = Date.now();
    const righe = await indice.queryRaw(`
      SELECT id, title, original_title, vote_count
      FROM movies
      WHERE ${NORM('title')} LIKE '${q}%'
         OR ${NORM('title')} LIKE '% ${q}%'
         OR ${NORM('original_title')} LIKE '${q}%'
         OR ${NORM('original_title')} LIKE '% ${q}%'
         OR replace(${NORM('title')}, ' ', '') = '${q.replace(/ /g, '')}'
      ORDER BY vote_count DESC
      LIMIT 3
    `);
    const ms = Date.now() - t0;
    console.log(`\n"${q}" — ${ms} ms`);
    for (const r of righe || []) console.log('   ', String(r.title).slice(0, 45).padEnd(46), 'voti=', r.vote_count);
    if (!righe || !righe.length) console.log('    (nessuno)');
  }
  await indice.close?.();
  process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
