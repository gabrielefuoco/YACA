// probe-search.js — MISURA le fasi della ricerca, senza scrivere nulla.
//
// Dentro il container, via STDIN (nessun file scritto in produzione):
//     ssh mate 'docker exec -i yaca-app node -' < ops/timing/probe-search.js 'the bear'
//
// Fasi isolate del percorso `routeCatalogRequest` → ricerca:
//   A. FTS5 del Tier 2   (src/db/tier2Index.js, SQLite in sola lettura)
//   B. nomi imparati     (src/db/learnedNames.js, LIKE senza indice — ripresa in sola lettura)
//   C. arricchimento con cache CALDA: GET su Redis dei dettagli TMDB gia' in cache
//      + JSON.parse, cioe' quello che costa una ricerca ripetuta
//   D. la stessa A+B per un termine che non trova nulla (solo costo dell'indice)
'use strict';
const fs = require('fs');
const path = require('path');

const APP = process.env.PROBE_APP_DIR || '/app';
const Redis = require(path.join(APP, 'node_modules/ioredis'));
const Database = require(path.join(APP, 'node_modules/better-sqlite3'));

const term = process.argv[2] || 'the bear';
const type = process.argv[3] || 'series';
const idxType = type === 'series' ? 'tv' : 'movie';

function timeIt(label, fn, runs = 5) {
  const out = [];
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    const r = fn();
    out.push({ ms: Number(process.hrtime.bigint() - t0) / 1e6, r });
  }
  const med = [...out].map(o => o.ms).sort((a, b) => a - b)[Math.floor(runs / 2)];
  console.log(`  ${label}: mediana ${med.toFixed(2)} ms  (min ${Math.min(...out.map(o => o.ms)).toFixed(2)} max ${Math.max(...out.map(o => o.ms)).toFixed(2)})`);
  return out[out.length - 1].r;
}

// ---------------------------------------------------------------- A. FTS5 Tier 2
const { Tier2SearchClient } = require(path.join(APP, 'src/db/tier2Index'));
const client = new Tier2SearchClient();
console.log(`\n### Ricerca '${term}' (type=${type}) · indice ${client.dbPath}`);
const rows = timeIt('A. FTS5 Tier 2 (search)', () => (client.init() ? client.search(term, { limit: 20, type: idxType }) : []), 7);
console.log(`     righe restituite: ${rows.length}`);

// ---------------------------------------------------------------- B. nomi imparati
const learnedPath = path.join(path.dirname(client.dbPath), 'learned_names.db');
if (fs.existsSync(learnedPath)) {
  const db = new Database(learnedPath, { readonly: true }); // sola lettura: nessuna scrittura
  const n = db.prepare('SELECT count(*) AS n FROM learned_names').get().n;
  const tokens = term.toLowerCase().split(/\s+/);
  const learned = timeIt('B. nomi imparati (LIKE, senza indice)', () => {
    const where = tokens.map(() => 'title_search LIKE ?').join(' AND ');
    const params = tokens.map(x => `%${x}%`);
    params.push(idxType, 5);
    return db.prepare(`SELECT tmdb_id, media_type, title_it, original_title, year FROM learned_names WHERE ${where} AND media_type = ? ORDER BY learned_at DESC LIMIT ?`).all(...params);
  }, 7);
  console.log(`     archivio: ${n} righe · trovate: ${learned.length}`);
  db.close();
} else {
  console.log(`  B. archivio nomi imparati assente (${learnedPath})`);
}

// ---------------------------------------------------------------- C. arricchimento caldo
(async () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379', { lazyConnect: true, maxRetriesPerRequest: 1 });
  await redis.connect();
  const ids = rows.map(r => String(r.id));
  const detailType = type === 'series' ? 'series' : 'movie';
  const prefix = `tmdb_details_raw:full:v2:${detailType}:`;
  const keys = ids.map(id => prefix + id);
  const lens = await Promise.all(keys.map(k => redis.strlen(k)));
  const present = lens.filter(l => l > 0).length;
  const bytes = lens.reduce((a, b) => a + b, 0);

  const t0 = process.hrtime.bigint();
  const raws = await Promise.all(keys.map(k => redis.get(k)));
  const tGet = Number(process.hrtime.bigint() - t0) / 1e6;
  const t1 = process.hrtime.bigint();
  const parsed = raws.filter(Boolean).map(r => JSON.parse(r));
  const tParse = Number(process.hrtime.bigint() - t1) / 1e6;

  console.log(`  C. arricchimento con cache CALDA`);
  console.log(`     chiavi presenti in Redis: ${present}/${keys.length}`);
  console.log(`     payload totale: ${(bytes / 1024).toFixed(1)} KB (media ${present ? Math.round(bytes / present / 1024) : 0} KB per dettaglio)`);
  console.log(`     Redis GET in parallelo: ${tGet.toFixed(1)} ms · JSON.parse di ${parsed.length} dettagli: ${tParse.toFixed(1)} ms`);
  console.log(`     campioni byte per chiave: ${lens.slice(0, 8).map(l => Math.round(l / 1024) + 'K').join(' ')}`);

  // Costo realistico dell'arricchimento: concorrenza 5 (ENRICH_CONCURRENCY), una richiesta per titolo.
  const oneByOne = [];
  for (const raw of raws.filter(Boolean)) {
    const t = process.hrtime.bigint();
    JSON.parse(raw);
    oneByOne.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  const tot = oneByOne.reduce((a, b) => a + b, 0);
  console.log(`     solo JSON.parse, in sequenza: ${tot.toFixed(1)} ms totali per ${oneByOne.length} titoli`);

  redis.disconnect();
  client.close();
})();
