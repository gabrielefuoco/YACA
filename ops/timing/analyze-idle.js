// analyze-idle.js — a cosa sta ASPETTANDO il processo: raggruppa i blocchi di tempo
// "idle" (main thread fermo = attesa di rete/native) per l'ultima funzione applicativa
// eseguita prima di andare in attesa.
//
//   node ops/timing/analyze-idle.js profilo.cpuprofile [sogliaMs]
'use strict';
const fs = require('fs');

const file = process.argv[2];
const minIdleUs = Number(process.argv[3] || 15) * 1000;

const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(prof.nodes.map(n => [n.id, n]));
const parent = new Map();
for (const n of prof.nodes) for (const c of (n.children || [])) parent.set(c, n.id);

function frame(n) {
  const cf = n.callFrame;
  const url = (cf.url || '').replace(/^.*\/node_modules\//, 'nm:').replace(/^.*\/app\//, '');
  return { name: cf.functionName || '(anon)', url, line: cf.lineNumber + 1 };
}
const isIdleNode = id => {
  const n = byId.get(id);
  return !n || n.callFrame.functionName === '(idle)' || n.callFrame.functionName === '(program)';
};
function lastAppFrame(id) {
  let cur = id, last = null;
  while (cur !== undefined) {
    const n = byId.get(cur);
    if (!n) break;
    const f = frame(n);
    if (f.url.includes('/src/') || f.url.includes('index.js') || f.url.includes('nm:axios') || f.url.includes('nm:mongodb')) {
      last = `${f.name} @ ${f.url}:${f.line}`;
    }
    cur = parent.get(cur);
  }
  return last || '(nessuna funzione applicativa nello stack)';
}

// Costruisce la timeline: da ogni campione, il nome dell'ultima frame applicativa
const timeline = [];
let t = 0;
let lastCause = '(inizio profilo)';
for (let i = 0; i < prof.samples.length; i++) {
  t += prof.timeDeltas[i] || 0;
  const id = prof.samples[i];
  const idle = isIdleNode(id);
  if (!idle) lastCause = lastAppFrame(id);
  timeline.push({ t, us: prof.timeDeltas[i] || 0, idle, cause: idle ? lastCause : lastCause });
}

// Blocchi di idle consecutivi
const blocks = [];
let cur = null;
for (const s of timeline) {
  if (s.idle) {
    if (!cur) cur = { us: 0, start: s.t, cause: s.cause };
    cur.us += s.us;
  } else {
    if (cur) { blocks.push(cur); cur = null; }
  }
}
if (cur) blocks.push(cur);

const totalIdle = blocks.reduce((a, b) => a + b.us, 0);
console.log(`profilo ${file}`);
console.log(`tempo idle totale: ${(totalIdle / 1000).toFixed(0)} ms in ${blocks.length} blocchi (>= ${minIdleUs / 1000} ms: ${blocks.filter(b => b.us >= minIdleUs).length})\n`);

const byCause = new Map();
for (const b of blocks) {
  if (b.us < minIdleUs) continue;
  const e = byCause.get(b.cause) || { us: 0, n: 0, max: 0 };
  e.us += b.us; e.n++; e.max = Math.max(e.max, b.us);
  byCause.set(b.cause, e);
}
console.log('--- tempo idle per "ultima funzione eseguita prima di aspettare" ---');
for (const [k, e] of [...byCause.entries()].sort((a, b) => b[1].us - a[1].us).slice(0, 20)) {
  console.log(`${(e.us / 1000).toFixed(1).padStart(9)} ms  blocchi=${String(e.n).padStart(4)}  blocco_max=${(e.max / 1000).toFixed(0).padStart(5)} ms  ${k}`);
}

console.log('\n--- cronologia dei blocchi idle >= 80 ms ---');
for (const b of blocks.filter(b => b.us >= 80000).slice(0, 40)) {
  console.log(`  a ${(b.start / 1000).toFixed(0).padStart(5)} ms: attesa ${(b.us / 1000).toFixed(0).padStart(5)} ms dopo ${b.cause}`);
}
