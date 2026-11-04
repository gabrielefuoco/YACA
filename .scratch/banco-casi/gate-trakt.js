#!/usr/bin/env node
/** gate-trakt.js — il controllo da 3 minuti del senior: 50 query tonali su /search/list,
 *  poi gli items delle prime N liste, e verifica sulle 8 ancore.
 *  node .scratch/banco-casi/gate-trakt.js [MAX_LISTE]
 */
require('dotenv').config({ quiet: true });
const fs = require('fs'), path = require('path');
const CACHE = path.join(__dirname, '../../.cache/trakt/lists-tonali');
const MAX = Number(process.argv[2] || 300);
const QUERIES = ['campy','satire','surreal','absurdist','female rage','fever dream','weird',
  'existential','dark comedy','black comedy','deadpan','grotesque','artificial world','neon noir',
  'slow burn','bleak','melancholic','unhinged','body horror','cult classics','psychological',
  'dystopian','paranoia','eat the rich','capitalism satire','plastic','dreamlike','lynchian',
  'cronenberg','gothic','whimsical','bittersweet','claustrophobic','cynical','gritty','nihilistic',
  'erotic thriller','folk horror','cosmic horror','postmodern','meta','suburban nightmare','pastel',
  'maximalist','minimalist','hypnotic','transgressive','queer camp','high society','urban loneliness'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = process.env.TRAKT_CLIENT_ID;
if (!KEY) { console.error('TRAKT_CLIENT_ID mancante'); process.exit(1); }
const H = { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': KEY,
            'User-Agent': 'yaca-tonal/1.0' };
const ANCORE = { 'Barbie': 346698, 'Povere creature!': 792307, 'The Substance': 933260,
  'EEAAO': 545611, 'Drive': 64690, 'Parasite': 496243, 'Lady Bird': 391713, 'The Truman Show': 37165 };

(async () => {
  fs.mkdirSync(CACHE, { recursive: true });
  const liste = new Map();
  for (const q of QUERIES) {
    for (const page of [1, 2]) {
      const url = `https://api.trakt.tv/search/list?query=${encodeURIComponent(q)}&page=${page}&limit=50`;
      try {
        const r = await fetch(url, { headers: H });
        if (r.status === 429) { await sleep(2000); continue; }
        if (!r.ok) continue;
        const js = await r.json();
        for (const e of (js || [])) {
          const l = e.list || e;
          const id = l.ids && l.ids.trakt;
          if (id && !liste.has(id)) liste.set(id, { id, nome: l.name || '', q,
            n: l.item_count || 0, likes: l.likes || 0 });
        }
      } catch (e) { /* pazienza */ }
      await sleep(330);
    }
    process.stdout.write('.');
  }
  console.log(`\nliste tonali trovate: ${liste.size}`);
  const scelte = [...liste.values()].filter(l => l.n >= 8 && l.n <= 120).slice(0, MAX);
  console.log(`dopo il filtro 8-120 item: ${scelte.length}`);
  let scaricate = 0, errori = 0;
  const appartenenza = new Map();
  for (const l of scelte) {
    const f = path.join(CACHE, `items-${l.id}.json`);
    let items = null;
    if (fs.existsSync(f)) { try { items = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {} }
    if (!items) {
      try {
        const r = await fetch(`https://api.trakt.tv/lists/${l.id}/items?limit=200`, { headers: H });
        if (r.status === 429) { await sleep(2000); continue; }
        if (!r.ok) { errori++; continue; }
        items = await r.json();
        fs.writeFileSync(f, JSON.stringify(items));
        await sleep(330);
      } catch (e) { errori++; continue; }
    }
    scaricate++;
    for (const it of (items || [])) {
      const o = it.movie || it.show; if (!o || !o.ids || !o.ids.tmdb) continue;
      const t = o.ids.tmdb;
      if (!appartenenza.has(t)) appartenenza.set(t, []);
      appartenenza.get(t).push(l.nome);
    }
  }
  console.log(`items scaricati: ${scaricate} liste · errori ${errori}`);
  const out = { liste: [...liste.values()], scaricate, errori,
                ancore: {}, globo: {} };
  for (const [nome, tmdb] of Object.entries(ANCORE)) {
    const dove = appartenenza.get(tmdb) || [];
    out.ancore[nome] = dove.length;
    console.log(`  ${nome}: in ${dove.length} liste`);
  }
  const co = appartenenza.get(346698) || [];
  const attesi = ['Povere creature!','The Substance','La rivincita delle bionde','The Truman Show',
    'Pleasantville','Marie Antoinette','The Love Witch','Josie and the Pussycats'];
  out.co_barbie = co;
  console.log(`Barbie co-membri (prime 40 liste): ${co.slice(0, 40).join(' | ') || '—'}`);
  fs.writeFileSync(path.join(CACHE, 'gate.json'), JSON.stringify(out, null, 1));
  const ancoreOk = Object.values(out.ancore).filter(v => v >= 5).length;
  console.log(`\nANCORE con >=5 liste: ${ancoreOk}/8`);
  console.log(ancoreOk >= 6 ? 'GATE: PASSA' : 'GATE: FALLISCE');
})();
