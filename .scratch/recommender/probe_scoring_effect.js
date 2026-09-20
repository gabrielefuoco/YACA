// Static-effect probe: does ProfileScorer use keywords/credits/vote_count that
// mapDuckDbRowToMeta does NOT provide? Pure JS, no DB.
const ProfileScorer = require('../../src/profile/ProfileScorer');
const graph = require('../../src/engines/graph/HierarchicalGraph');

// Synthetic V_final: one genre + one keyword topos vector
const kwObj = { id: 4379, name: 'time travel' };
const hVec = graph.vectorizeKeywords([kwObj]);
const V_final = { 'g:878': 60, ...Object.fromEntries(Object.entries(hVec).map(([k, v]) => [k, v * 40])) };
const profile = { compiledVectors: { V_final } };

const base = { id: 1, genre_ids: [878], vote_average: 8.0, vote_count: 5000 };
const enriched = { ...base, keywords: { results: [kwObj] }, credits: { cast: [], crew: [] } };
// exactly what mapDuckDbRowToMeta.rawTMDB offers: no keywords/credits/vote_count
const lightMetaRaw = { id: 1, genres: [{id:878,name:'Science Fiction'}], vote_average: 8.0, popularity: 100 };

const sEnriched = ProfileScorer.calculateItemMatch(enriched, profile, {});
const sNoKw = ProfileScorer.calculateItemMatch(base, profile, {});
const sLight = ProfileScorer.calculateItemMatch(lightMetaRaw, profile, {});
console.log(JSON.stringify({
  enriched_with_keywords: sEnriched,
  same_item_without_keywords: sNoKw,
  real_light_meta_rawTMDB: sLight,
  keyword_signal_lost: sEnriched !== sNoKw,
  light_equals_nokw: sLight === sNoKw
}, null, 2));
