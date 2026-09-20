const duckDbStore = require('../../src/db/duckDbStore');
const { getDuckDbCatalogFromPreset } = require('../../src/catalog/providers/DuckDbProvider');
const { F, S } = require('../../src/data/filters');

(async () => {
  await duckDbStore.init();
  const rows = await duckDbStore.query('SELECT COUNT(*) AS n, COUNT(keywords) AS kw_notnull FROM movies');
  console.log('movies rows:', JSON.stringify(rows, (k, v) => typeof v === 'bigint' ? v.toString() : v));
  const sample = await duckDbStore.query('SELECT id, title, keywords, genres, vote_average, vote_count, popularity FROM movies WHERE keywords IS NOT NULL LIMIT 2');
  console.log('RAW SAMPLE keywords:', JSON.stringify(sample[0] && sample[0].keywords).slice(0, 400));
  const metas = await getDuckDbCatalogFromPreset({ type: 'movie', where: [F.minVotes(1000)], orderBy: S.POPULAR }, 0, 3);
  console.log('LIGHT META keys:', Object.keys(metas[0] || {}).join(','));
  console.log('LIGHT META rawTMDB keys:', Object.keys(metas[0]?.rawTMDB || {}).join(','));
  console.log('has vote_count in rawTMDB?', 'vote_count' in (metas[0]?.rawTMDB || {}), '| has keywords?', 'keywords' in (metas[0]?.rawTMDB || {}), '| has credits?', 'credits' in (metas[0]?.rawTMDB || {}));
  console.log('meta vote_count?', 'vote_count' in (metas[0] || {}));
  duckDbStore.close();
})().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
