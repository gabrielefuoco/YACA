// probe-net.js — quante connessioni TCP verso :443 (TMDB/CDN) e :27017 (Mongo)
// il processo apre davvero durante una richiesta. Solo letture di /proc/net/tcp.
//
// Il conteggio delle "connessioni viste" è per porta locale: ogni connessione TCP
// ha una porta locale diversa, quindi il numero di porte locali distinte osservate
// è il numero di connessioni aperte (approssimato: una connessione puo' sfuggire
// al campionamento se dura meno di SAMPLE_MS).
//
//   ssh mate 'docker exec -i yaca-app node - <url> <n>' < ops/timing/probe-net.js
'use strict';
const fs = require('fs');
const http = require('http');

const URL_ = process.argv[2];
const REPEAT = Number(process.argv[3] || 1);
const SAMPLE_MS = Number(process.argv[4] || 15);

function sockets() {
  const byPort = {};
  const conns = new Set(); // "ip:port<-localPort"
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let txt;
    try { txt = fs.readFileSync(file, 'utf8'); } catch (_e) { continue; }
    for (const line of txt.trim().split('\n').slice(1)) {
      const p = line.trim().split(/\s+/);
      if (p[3] !== '01') continue; // 01 = ESTABLISHED
      const remotePort = parseInt(p[2].split(':')[1], 16);
      const localPort = parseInt(p[1].split(':')[1], 16);
      const remoteIp = p[2].split(':')[0];
      byPort[remotePort] = byPort[remotePort] || { count: 0, ips: new Set() };
      byPort[remotePort].count++;
      byPort[remotePort].ips.add(remoteIp);
      conns.add(`${remoteIp}:${remotePort}<-${localPort}`);
    }
  }
  return { byPort, conns };
}

function summarize(label, samples) {
  const peak = {};
  const ips = {};
  const conns = new Set();
  for (const s of samples) {
    for (const [port, v] of Object.entries(s.byPort)) {
      peak[port] = Math.max(peak[port] || 0, v.count);
      ips[port] = new Set([...(ips[port] || []), ...v.ips]);
    }
    for (const c of s.conns) conns.add(c);
  }
  const perPort = {};
  for (const c of conns) {
    const remote = c.split('<-')[0];
    const port = remote.split(':').pop();
    perPort[port] = (perPort[port] || 0) + 1;
  }
  const parts = Object.keys(peak).sort((a, b) => b - a).slice(0, 6)
    .map(p => `:${p} picco=${peak[p]} ip_distinti=${(ips[p] || new Set()).size}`);
  const connParts = Object.entries(perPort).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([p, n]) => `:${p} ${n} connessioni`);
  console.log(`  ${label}\n     contemporanei: ${parts.join('  ')}\n     aperte nel campione: ${connParts.join('  ')}`);
}

function get(url) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    http.get(url, res => {
      let n = 0;
      res.on('data', c => { n += c.length; });
      res.on('end', () => resolve({ ms: Date.now() - t0, bytes: n }));
    }).on('error', reject);
  });
}

(async () => {
  console.log(`### ${URL_}`);
  const idle = [];
  for (let i = 0; i < 25; i++) { idle.push(sockets()); await new Promise(r => setTimeout(r, SAMPLE_MS)); }
  summarize(`IDLE ~${idle.length * SAMPLE_MS} ms senza richieste`, idle);

  for (let k = 0; k < REPEAT; k++) {
    const during = [];
    const p = get(URL_);
    const timer = setInterval(() => during.push(sockets()), SAMPLE_MS);
    const r = await p;
    clearInterval(timer);
    summarize(`richiesta ${k + 1}: ${r.ms} ms, ${r.bytes} B`, during);
  }
})();
