// How well do MOOD_KEYWORDS_MAP terms intersect the graph's L2.top_keywords and L1 keywords?
const graph = require('../../src/engines/graph/HierarchicalGraph');
const MOODS = {
  "Intenso": ['action','thriller','survival','martial arts','superhero','explosion','shootout','violence','blood','chase','murder','police','revenge'],
  "Rilassante": ['feel-good','slice of life','comedy','healing','relaxing','friendship','family','vacation','peaceful','romantic comedy','love'],
  "Psicologico": ['mind-bending','psychological thriller','mystery','detective','dark','plot twist','suspense','paranoia','investigation','mind control'],
  "Drammatico": ['tearjerker','sad','crying','melodrama','heartbreaking','emotional','tragedy','terminal illness','grief','loneliness'],
  "Epico": ['epic','journey','magic','fantasy world','space opera','adventure','quest','empire','mythology','chosen one','sword and sorcery']
};
const d = graph.data;
const L2 = Object.entries(d.L2 || {});
console.log('L2 nodes total:', L2.length, '| L1 nodes total:', Object.keys(d.L1||{}).length, '| kw_to_L1 keys:', Object.keys(d.kw_to_L1||{}).length);
for (const [mood, kws] of Object.entries(MOODS)) {
  let nodesHit = 0; const hits = new Map();
  for (const [id, node] of L2) {
    const top = node.top_keywords || [];
    const matched = kws.filter(k => top.includes(k));
    if (matched.length) { nodesHit++; hits.set(id, matched); }
  }
  // how many mood kw are present anywhere in graph kw_to_L1 (string keys)?
  const inGraph = kws.filter(k => d.kw_to_L1 && d.kw_to_L1[k]);
  console.log(`MOOD ${mood}: L2 hit by intersection=${nodesHit} | mood kws found as kw_to_L1 keys=${inGraph.length}/${kws.length} [${inGraph.join(',')}]`);
}
const sample = L2.slice(0, 3).map(([id, n]) => ({ id, ui_name: n.ui_name, n_top: (n.top_keywords||[]).length, top_keywords: (n.top_keywords||[]).slice(0,8) }));
console.log('L2 SAMPLE:', JSON.stringify(sample, null, 1));
