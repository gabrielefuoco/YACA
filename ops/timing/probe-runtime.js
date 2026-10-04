// probe-runtime.js — MISURA, non modifica.
//
// Eseguito dentro il container di produzione via STDIN, così nel container non
// viene scritto nessun file:
//     ssh mate 'docker exec -i yaca-app node -' < ops/timing/probe-runtime.js
//
// Tre domande, tutte lette:
//   1. quanto costa un singolo `fs.statSync` sulla cartella dei poster
//      (`/data/erdb-cache`), cioè `esistePosterInCache` di StremioFormatter.js:154;
//   2. quanto costa un PING su Redis, cioè il costo di `catalogRequestCache`;
//   3. quanto costa una `findOne` su MongoDB (Atlas), cioè
//      `UserConfig.resolveUserConfig` che gira su OGNI richiesta.
'use strict';
const fs = require('fs');
const path = require('path');

const ms = (a, b) => Number((b - a).toFixed(2));
const stat = (t) => t.map(x => Number(x.toFixed(2)));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function phase(title) {
  console.log(`\n### ${title}`);
}

// ---------------------------------------------------------------- 1. fs.statSync
function probeStat() {
  phase('1. fs.statSync sui poster (StremioFormatter.js:154 esistePosterInCache)');
  const dir = process.env.ERDB_CACHE_DIR || '/data/erdb-cache';
  let files;
  try {
    files = fs.readdirSync(dir).filter(n => /\.(jpe?g|webp)$/i.test(n)).slice(0, 200);
  } catch (e) {
    console.log(`  cartella ${dir} non leggibile: ${e.message}`);
    return;
  }
  console.log(`  cartella=${dir} file campionati=${files.length}`);

  const one = files.map(n => { const t = process.hrtime.bigint(); fs.statSync(path.join(dir, n)); return Number(process.hrtime.bigint() - t) / 1e6; });
  console.log(`  200 stat una a una : mediana ${med(one).toFixed(3)} ms  -> ${med(one).toFixed(3)} ms per poster`);

  // Come un catalogo da 100 titoli: 100 stat in fila, 20 volte.
  const page = files.slice(0, 100);
  const runs = [];
  for (let r = 0; r < 20; r++) {
    const t0 = process.hrtime.bigint();
    for (const n of page) fs.statSync(path.join(dir, n));
    runs.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  console.log(`  100 stat (pagina) x20: mediana ${med(runs).toFixed(2)} ms per pagina di 100 poster`);
  console.log(`  campioni pagina: ${stat(runs.slice(0, 5)).join(' ')}`);

  // File assente: il ramo `catch` di un catalogo senza poster in cache.
  const missing = [];
  for (let r = 0; r < 10; r++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) { try { fs.statSync(path.join(dir, `__inesistente_${i}.jpg`)); } catch (_e) { missing.push(0); } }
    missing.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  console.log(`  100 stat di file INESISTENTI x10: mediana ${med(missing).toFixed(2)} ms per pagina`);
}

// ---------------------------------------------------------------- 2. Redis
async function probeRedis() {
  phase('2. Redis (cache dei cataloghi)');
  try {
    const Redis = require('ioredis');
    const r = new Redis(process.env.REDIS_URL || 'redis://redis:6379', { lazyConnect: true, maxRetriesPerRequest: 1 });
    await r.connect();
    const pings = [];
    for (let i = 0; i < 10; i++) { const t0 = process.hrtime.bigint(); await r.ping(); pings.push(Number(process.hrtime.bigint() - t0) / 1e6); }
    console.log(`  PING x10: mediana ${med(pings).toFixed(3)} ms  campioni ${stat(pings.slice(0, 5)).join(' ')}`);
    const t0 = process.hrtime.bigint();
    await r.get('__chiave_inesistente__');
    console.log(`  GET mancante: ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(3)} ms`);
    r.disconnect();
  } catch (e) {
    console.log(`  redis non raggiungibile: ${e.message}`);
  }
}

// ---------------------------------------------------------------- 3. MongoDB
async function probeMongo() {
  phase('3. MongoDB Atlas (UserConfig.resolveUserConfig — 2 findOne per richiesta)');
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.log('  MONGODB_URI assente'); return; }
  const host = (() => { try { return new URL(uri.replace('mongodb+srv://', 'mongodb://')).host; } catch (_e) { return '?'; } })();
  console.log(`  host=${host}`);

  // 3a. RTT grezzo (TCP + TLS), senza toccare il database.
  const net = require('net');
  const tls = require('tls');
  const [hostname, portStr] = host.split(':');
  const port = Number(portStr || 27017);
  await new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const s = net.connect(port, hostname, () => {
      const tcp = Number(process.hrtime.bigint() - t0) / 1e6;
      s.end();
      const t1 = process.hrtime.bigint();
      const t = tls.connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false }, () => {
        console.log(`  handshake TCP ${tcp.toFixed(1)} ms | +TLS ${(Number(process.hrtime.bigint() - t1) / 1e6).toFixed(1)} ms`);
        t.end(); resolve();
      });
      t.on('error', () => resolve());
    });
    s.on('error', () => resolve());
  });

  // 3b. Le due findOne vere, con la stessa libreria del processo.
  try {
    const mongoose = require('mongoose');
    const t0 = Date.now();
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`  mongoose.connect (fuori percorso richiesta): ${Date.now() - t0} ms`);
    const db = mongoose.connection.db;
    const uuid = process.env.PROBE_UUID || '';
    for (let i = 0; i < 5; i++) {
      const t1 = process.hrtime.bigint();
      await db.collection('addonconfigs').findOne({ uuid }, { projection: { uuid: 1, config: 1, profiles: 1 } });
      const addon = Number(process.hrtime.bigint() - t1) / 1e6;
      const t2 = process.hrtime.bigint();
      await db.collection('useraccounts').findOne({ addonUuid: uuid }, { projection: { userId: 1 } });
      const acct = Number(process.hrtime.bigint() - t2) / 1e6;
      console.log(`  findOne addonconfigs ${addon.toFixed(1)} ms | findOne useraccounts ${acct.toFixed(1)} ms | somma ${(addon + acct).toFixed(1)} ms`);
    }
    await mongoose.disconnect();
  } catch (e) {
    console.log(`  mongo non interrogabile: ${e.message}`);
  }
}

(async () => {
  console.log(`node ${process.version} · ${new Date().toISOString()} · rss ${Math.round(process.memoryUsage().rss / 1048576)} MB`);
  probeStat();
  await probeRedis();
  await probeMongo();
})();
