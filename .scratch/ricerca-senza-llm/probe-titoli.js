/**
 * Sonda: quanto e' severo il seme di `simili`?
 *   node .scratch/ricerca-senza-llm/probe-titoli.js
 */
require('dotenv').config();
const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');
const indice = require('../../src/indice');

(async () => {
  await indice.init();
  const { risolviTitolo } = require('../../src/ricerca/risolutori');

  const nome = async (id) => {
    const righe = await indice.queryRaw(`SELECT title AS nome FROM movies WHERE id = ${Number(id)} LIMIT 1`);
    return righe && righe[0] ? righe[0].nome : null;
  };

  const casi = ['hunger game', 'hunger games', 'inter', 'interstelar', 'bat', 'batman', 'the hunger games'];
  for (const cercato of casi) {
    const id = await risolviTitolo(cercato, { type: 'movie', contesto: {} });
    const nomeTitolo = id ? await nome(id[0]) : null;
    console.log(JSON.stringify(cercato).padEnd(22), '→ seme:', JSON.stringify(id).padEnd(12), nomeTitolo || '(nessuno)');
  }
  await indice.close?.();
  process.exit(0);
})().catch(e => { console.error('errore:', e.message); process.exit(1); });
