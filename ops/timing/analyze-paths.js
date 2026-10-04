// analyze-paths.js — dal .cpuprofile, i cammini di chiamata più pesanti che passano
// per un dato modulo (es. axios) e la funzione applicativa che li ha chiamati.
//   node ops/timing/analyze-paths.js profilo.cpuprofile axios
'use strict';
const fs = require('fs');

const file = process.argv[2];
const needle = (process.argv[3] || 'axios').toLowerCase();
const topN = Number(process.argv[4] || 15);

const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(prof.nodes.map(n => [n.id, n]));
const parent = new Map();
for (const n of prof.nodes) for (const c of (n.children || [])) parent.set(c, n.id);

const self = new Map();
for (let i = 0; i < prof.samples.length; i++) {
  const id = prof.samples[i];
  const dt = prof.timeDeltas[i] || 0;
  self.set(id, (self.get(id) || 0) + Math.max(0, dt));
}

function frameName(n) {
  const cf = n.callFrame;
  const url = (cf.url || '').replace(/^.*\/node_modules\//, 'nm:').replace(/^.*\/app\//, '');
  return `${cf.functionName || '(anon)'}@${url}:${cf.lineNumber + 1}`;
}

function pathToRoot(id) {
  const out = [];
  let cur = id;
  while (cur !== undefined) {
    const n = byId.get(cur);
    if (!n) break;
    out.push(frameName(n));
    cur = parent.get(cur);
  }
  return out;
}

// Raggruppa i campioni il cui stack contiene `needle` per chiamante applicativo
const groups = new Map();
let totalMatched = 0;
for (const [id, us] of self) {
  const path = pathToRoot(id);
  if (!path.some(fr => fr.toLowerCase().includes(needle))) continue;
  totalMatched += us;
  const appFrames = path.filter(fr => fr.includes('src/') || fr.includes('index.js'));
  const key = appFrames.slice(0, 2).join(' <- ') || '(nessun frame applicativo)';
  const g = groups.get(key) || { us: 0, n: 0, deepest: path[0] };
  g.us += us; g.n++;
  groups.set(key, g);
}

console.log(`profilo ${file} · campioni che passano per "${needle}": ${(totalMatched / 1000).toFixed(0)} ms`);
for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].us - a[1].us).slice(0, topN)) {
  console.log(`${(g.us / 1000).toFixed(1).padStart(8)} ms  campioni=${String(g.n).padStart(5)}  ${k}`);
  console.log(`${''.padStart(8)}    foglia: ${g.deepest}`);
}
