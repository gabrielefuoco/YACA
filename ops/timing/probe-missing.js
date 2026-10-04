// probe-missing.js — per la pagina di una ricerca: quali titoli del Tier 2 NON
// finiscono nella cache dei dettagli, e quindi vengono ri-scaricati da TMDB a ogni
// richiesta. Solo letture (FTS5 in sola lettura + Redis GET).
//
//   ssh mate 'docker exec -i yaca-app node - "the bear" series' < ops/timing/probe-missing.js
'use strict';
const path = require('path');
const fs = require('fs');
const APP = process.env.PROBE_APP_DIR || '/app';
const Redis = require(path.join(APP, 'node_modules/ioredis'));
const { Tier2SearchClient } = require(path.join(APP, 'src/db/tier2Index'));

const term = process.argv[2] || 'the bear';
const type = process.argv[3] || 'series';
const idxType = type === 'series' ? 'tv' : 'movie';

(async () => {
  const client = new Tier2SearchClient();
  const rows = client.init() ? client.search(term, { limit: 20, type: idxType }) : [];
  const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379', { lazyConnect: true, maxRetriesPerRequest: 1 });
  await redis.connect();

  console.log(`termine '${term}' · ${rows.length} righe dal Tier 2`);
  const missing = [];
  for (const r of rows) {
    const id = String(r.id);
    const len = await redis.strlen(`tmdb_details_raw:full:v2:${type}:${id}`);
    if (len === 0) missing.push({ id, title: r.title });
    console.log(`  tmdb:${String(id).padEnd(8)} ${len > 0 ? `cache ${String(Math.round(len / 1024)).padStart(5)} KB` : 'NESSUNA CACHE (si riscarica da TMDB)'}`);
  }
  console.log(`\nda riscaricare a ogni ricerca: ${missing.length}/${rows.length}`);
  console.log(missing.map(m => `tmdb:${m.id} (${m.title})`).join('\n'));
  redis.disconnect();
  client.close();
})();
