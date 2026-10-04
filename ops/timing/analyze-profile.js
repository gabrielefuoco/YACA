// analyze-profile.js — somma il tempo di un .cpuprofile per funzione e per file.
//   node ops/timing/analyze-profile.js profilo.cpuprofile [topN]
'use strict';
const fs = require('fs');

const file = process.argv[2];
const topN = Number(process.argv[3] || 30);
const prof = JSON.parse(fs.readFileSync(file, 'utf8'));

const byId = new Map(prof.nodes.map(n => [n.id, n]));
const self = new Map();      // nodeId -> microsecondi
const counts = new Map();    // nodeId -> campioni

// I campioni sono delta in microsecondi tra un campione e il successivo.
for (let i = 0; i < prof.samples.length; i++) {
  const id = prof.samples[i];
  const dt = (i + 1 < prof.timeDeltas ? prof.timeDeltas[i] : (prof.timeDeltas[prof.timeDeltas.length - 1] || 0));
  self.set(id, (self.get(id) || 0) + Math.max(0, dt));
  counts.set(id, (counts.get(id) || 0) + 1);
}

const durMs = (prof.endTime - prof.startTime) / 1000;
const totalUs = [...self.values()].reduce((a, b) => a + b, 0);

function label(n) {
  const cf = n.callFrame;
  const url = (cf.url || '').replace(/^.*\/node_modules\//, 'nm:').replace(/^.*\/(src|scripts|index\.js)/, '$1');
  return `${cf.functionName || '(anon)'} @ ${url}:${cf.lineNumber + 1}`;
}

// Aggregazione per funzione (stesso functionName+url+line)
const byFn = new Map();
for (const [id, us] of self) {
  const n = byId.get(id);
  if (!n) continue;
  const k = label(n);
  const e = byFn.get(k) || { us: 0, n: 0 };
  e.us += us; e.n += (counts.get(id) || 0);
  byFn.set(k, e);
}

// Voltree: tempo "total" (genere + figli) per funzione ricorsiva
const children = new Map();
for (const n of prof.nodes) for (const c of (n.children || [])) children.set(c, n.id);
function totalUsOf(id) {
  let sum = self.get(id) || 0;
  for (const n of prof.nodes) {
    if ((n.children || []).includes(id)) sum += totalUsOf(n.id);
  }
  return sum;
}
const totalByFn = new Map();
for (const n of prof.nodes) {
  const k = label(n);
  totalByFn.set(k, (totalByFn.get(k) || 0) + totalUsOf(n.id));
}

console.log(`profilo: ${file}`);
console.log(`durata campionata: ${durMs.toFixed(0)} ms · campioni: ${prof.samples.length} · tempo attribuito: ${(totalUs / 1000).toFixed(0)} ms`);
console.log(`media campione: ${(totalUs / prof.samples.length / 1000).toFixed(3)} ms\n`);

console.log(`--- tempo PROPRIO per funzione (top ${topN}) ---`);
for (const [k, e] of [...byFn.entries()].sort((a, b) => b[1].us - a[1].us).slice(0, topN)) {
  console.log(`${(e.us / 1000).toFixed(1).padStart(9)} ms  ${String(e.n).padStart(6)} campioni  ${((e.us / totalUs) * 100).toFixed(1).padStart(5)}%  ${k}`);
}

console.log(`\n--- tempo TOTALE (con chiamate annidate) per funzione (top ${topN}) ---`);
for (const [k, us] of [...totalByFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN)) {
  console.log(`${(us / 1000).toFixed(1).padStart(9)} ms  ${k}`);
}

// Tempo idle: campioni il cui stack non contiene codice applicativo
const appIds = new Set(prof.nodes.filter(n => (n.callFrame.url || '').includes('/src/') || (n.callFrame.url || '').endsWith('index.js')).map(n => n.id));
function hasAppAncestor(id) {
  let cur = id;
  while (cur) {
    if (appIds.has(cur)) return true;
    cur = children.get(cur);
  }
  return false;
}
let idleUs = 0;
for (const [id, us] of self) if (!hasAppAncestor(id)) idleUs += us;
console.log(`\n--- tempo SENZA codice applicativo nello stack (attesa I/O): ${(idleUs / 1000).toFixed(0)} ms (${((idleUs / totalUs) * 100).toFixed(1)}%) ---`);
