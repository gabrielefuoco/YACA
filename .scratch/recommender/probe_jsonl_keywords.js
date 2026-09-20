// Evidence: how the matchmaker's ILIKE '%"kw"%' behaves against the real local dump
const fs = require('fs');
const readline = require('readline');
const path = '.cache/tmdb/master_movies.jsonl';
const MOODS = ['action','thriller','survival','martial arts','superhero','explosion','shootout','violence','blood','chase','murder','police','revenge','love','family','comedy','dark','mystery','epic','magic','journey','adventure'];
const counts = Object.fromEntries(MOODS.map(m => [m, 0]));
let n = 0, withKws = 0, first = null;
const rl = readline.createInterface({ input: fs.createReadStream(path), crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  n++;
  let o; try { o = JSON.parse(line); } catch { return; }
  const kws = o.keywords?.keywords || o.keywords || [];
  if (Array.isArray(kws) && kws.length) withKws++;
  if (n === 1) first = { title: o.title, genres: o.genres, keywordsSample: (Array.isArray(kws)?kws:[]).slice(0,3), kwType: typeof kws[0] };
  const json = JSON.stringify(kws);
  for (const m of MOODS) if (json.includes(`"${m}"`)) counts[m]++;
  if (n >= 5000) rl.close();
});
rl.on('close', () => {
  console.log('parsed lines:', n, '| with keywords:', withKws);
  console.log('first item:', JSON.stringify(first));
  console.log('keyword-string MATCH counts (ILIKE %"x"% semantics):');
  console.log(JSON.stringify(counts, null, 0));
});
