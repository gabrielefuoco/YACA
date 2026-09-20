const ProfileScorer = require('../../src/profile/ProfileScorer');
const graph = require('../../src/engines/graph/HierarchicalGraph');
const kwObj = { id: 4379, name: 'time travel' };
const hVec = graph.vectorizeKeywords([kwObj]);
// Profile with NO genre signal: only keyword topoi (common for mood-driven users)
const profile = { compiledVectors: { V_final: Object.fromEntries(Object.entries(hVec).map(([k,v]) => [k, v*40])) } };

const withKw = { id: 1, genre_ids: [18], vote_average: 8.0, vote_count: 5000, keywords: { results: [kwObj] } };
const withoutKw = { id: 2, genre_ids: [18], vote_average: 8.0, vote_count: 5000 };
// two light metas, same genre, VERY different quality -> identical score if vote_count is missing
const lightA = { id: 3, genres: [{id:18,name:'Drama'}], vote_average: 9.5, popularity: 500 };
const lightB = { id: 4, genres: [{id:18,name:'Drama'}], vote_average: 2.0, popularity: 1 };

const s = (i) => Number(ProfileScorer.calculateItemMatch(i, profile, {}).toFixed(4));
console.log(JSON.stringify({
  keyword_only_profile: {
    with_keyword: s(withKw),
    without_keyword: s(withoutKw)
  },
  light_meta_quality_blind: {
    high_rated: s(lightA),
    low_rated: s(lightB),
    identical: s(lightA) === s(lightB)
  }
}, null, 2));
