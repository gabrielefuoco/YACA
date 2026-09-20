const graph = require('../../src/engines/graph/HierarchicalGraph');
const d = graph.data;
let over = 0, total = 0, max = 0, maxId = null;
for (const [id, n] of Object.entries(d.L2 || {})) {
  const map = graph.getKeywordsForNodes([id], 'L2');
  const arr = map.get(id) || [];
  total++;
  if (arr.length >= 30) over++;
  // count raw expansion before sampling
  let raw = 0; const seen = new Set();
  for (const l1 of (n.children_L1 || [])) { for (const k of (d.L1?.[l1]?.keywords || [])) if (!seen.has(k)) { seen.add(k); raw++; } }
  if (raw > max) { max = raw; maxId = id; }
}
const big = Array.from(Object.keys(d.L2)).find(id => {
  const s = new Set(); for (const l1 of (d.L2[id].children_L1||[])) for (const k of (d.L1?.[l1]?.keywords||[])) s.add(k); return s.size > 30;
});
const a = new Set(graph.getKeywordsForNodes([big],'L2').get(big));
let diffFound = false;
for (let i=0;i<20;i++){ const b = new Set(graph.getKeywordsForNodes([big],'L2').get(big)); if ([...b].some(k=>!a.has(k))) { diffFound = true; break; } }
console.log(JSON.stringify({ l2_total: total, l2_with_expansion_ge_30: over, raw_max_expansion: max, maxId, sample_big_node: big, sampled_len: a.size, nondeterministic_across_20_calls: diffFound }, null, 2));
