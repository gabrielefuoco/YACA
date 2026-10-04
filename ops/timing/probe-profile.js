// probe-profile.js — profilo CPU del processo di produzione, via ispettore V8.
//
// Non modifica codice ne' dati: `kill -USR1 1` apre l'ispettore del debugger
// sulla porta 9229 **interna al container** (non pubblicata), noi ci colleghiamo
// da dentro, profiliamo due richieste reali e alla fine chiudiamo l'ispettore
// con `inspector.close()` per riportare il processo com'era.
//
//   ssh mate 'docker exec yaca-app kill -USR1 1'
//   ssh mate 'docker exec -i yaca-app node --experimental-websocket - <url> <n>' \
//       < ops/timing/probe-profile.js > profilo.cpuprofile
//
// Il profilo JSON esce su stdout; il resto va su stderr.
'use strict';
const http = require('http');

const TARGET_URL = process.argv[2] || 'http://127.0.0.1:7860/';
const REPEAT = Number(process.argv[3] || 1);

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let n = 0;
      res.on('data', (c) => { n += c.length; });
      res.on('end', () => resolve({ status: res.statusCode, bytes: n }));
    }).on('error', reject);
  });
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method) {
        events.push(msg);
      }
    };
    ws.onerror = (e) => reject(new Error('ws error: ' + (e.message || '?')));
    ws.onopen = () => resolve({
      events,
      send(method, params) {
        const mid = ++id;
        return new Promise((res, rej) => {
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
        });
      },
      close() { ws.close(); }
    });
  });
}

(async () => {
  const list = await (await fetch('http://127.0.0.1:9229/json/list')).json();
  const target = list.find(t => t.webSocketDebuggerUrl);
  if (!target) throw new Error('nessun target con inspector');
  console.error(`target: ${target.title} · ws ${target.webSocketDebuggerUrl}`);

  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); // 100 microsecondi
  await cdp.send('Network.enable'); // conteggio delle richieste HTTP in uscita
  await cdp.send('Profiler.start');

  const timings = [];
  for (let i = 0; i < REPEAT; i++) {
    const t0 = Date.now();
    const r = await get(TARGET_URL);
    timings.push(`${Date.now() - t0} ms ${r.bytes} B (${r.status})`);
  }

  const { profile } = await cdp.send('Profiler.stop');
  await cdp.send('Network.disable');
  await cdp.send('Profiler.disable');

  // Chiude l'ispettore: il processo torna com'era prima di `kill -USR1`.
  try { await cdp.send('Runtime.evaluate', { expression: "require('inspector').close()" }); } catch (_e) { /* gia' chiuso */ }
  cdp.close();

  console.error('richieste servite durante il profilo: ' + timings.join(' | '));
  // Le richieste HTTP viste dal processo, raggruppate per host.
  const reqs = cdp.events.filter(e => e.method === 'Network.requestWillBeSent');
  const byHost = {};
  for (const e of reqs) {
    let host = '?';
    try { host = new URL(e.params.request.url).host; } catch (_e) { /* non URL */ }
    byHost[host] = (byHost[host] || 0) + 1;
  }
  console.error('richieste uscenti per host: ' + JSON.stringify(byHost));
  const details = reqs.filter(e => /themoviedb|mongodb|redis/.test(e.params.request.url || ''));
  console.error('richieste verso TMDB/DB: ' + details.map(e => e.params.request.url.split('?')[0]).join(' | '));

  process.stdout.write(JSON.stringify(profile));
})().catch(e => { console.error('ERRORE: ' + e.message); process.exit(1); });
