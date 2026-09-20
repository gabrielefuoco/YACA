const fs = require('fs');
const readline = require('readline');
const path = '.cache/tmdb/master_movies.jsonl';
const MOODS = {
  Intenso: ['action','thriller','survival','martial arts','superhero','explosion','shootout','violence','blood','chase','murder','police','revenge'],
  Rilassante: ['feel-good','slice of life','comedy','healing','relaxing','friendship','family','vacation','peaceful','romantic comedy','love'],
  Psicologico: ['mind-bending','psychological thriller','mystery','detective','dark','plot twist','suspense','paranoia','investigation','mind control'],
  Drammatico: ['tearjerker','sad','crying','melodrama','heartbreaking','emotional','tragedy','terminal illness','grief','loneliness'],
  Epico: ['epic','journey','magic','fantasy world','space opera','adventure','quest','empire','mythology','chosen one','sword and sorcery']
};
const moodAny = {}; for (const [m,ks] of Object.entries(MOODS)) moodAny[m]=0;
const kwCount = {};
let n=0, withKws=0;
const rl = readline.createInterface({ input: fs.createReadStream(path), crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return; n++;
  let o; try { o = JSON.parse(line); } catch { return; }
  let kws = [];
  try { kws = typeof o.keywords === 'string' ? JSON.parse(o.keywords) : (o.keywords || []); } catch {}
  if (!Array.isArray(kws) || kws.length === 0) return;
  withKws++;
  const namesLast = JSON.stringify(kws); // ILIKE semantics on the stored VARCHAR
  for (const [m, ks] of Object.entries(MOODS)) {
    if (ks.some(k => namesLast.includes(`"${k}"`))) moodAny[m]++;
  }
  for (const kw of kws) { const nm = (kw.name||'').toLowerCase(); kwCount[nm]=(kwCount[nm]||0)+1; }
});
rl.on('close', () => {
  console.log('total lines:', n, '| with keywords:', withKws);
  console.log('movies matching >=1 keyword of each mood (ILIKE semantics):', JSON.stringify(moodAny));
  const top = Object.entries(kwCount).sort((a,b)=>b[1]-a[1]).slice(0,15);
  console.log('top real keyword names:', JSON.stringify(top));
});
