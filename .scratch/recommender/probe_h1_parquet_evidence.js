const duckDbStore = require('../../src/db/duckDbStore');
const { getDuckDbCatalogFromPreset } = require('../../src/catalog/providers/DuckDbProvider');
const ProfileScorer = require('../../src/profile/ProfileScorer');
const HierarchicalGraph = require('../../src/engines/graph/HierarchicalGraph');
const { F, S } = require('../../src/data/filters');

(async () => {
  await duckDbStore.init();

  console.log('--- 1. PARQUET COLUMNS & DATA VERIFICATION ---');
  const sample = await duckDbStore.query(`
    SELECT id, title, vote_average, vote_count, popularity, genres, keywords, "cast", directors 
    FROM movies 
    WHERE vote_count > 5000 AND keywords IS NOT NULL 
    LIMIT 5
  `);
  
  console.log(`Found ${sample.length} sample movies from DuckDB:`);
  for (const m of sample) {
    const kws = JSON.parse(m.keywords || '[]');
    const cast = JSON.parse(m.cast || '[]');
    const dirs = JSON.parse(m.directors || '[]');
    console.log(`- [${m.id}] "${m.title}" | rating: ${m.vote_average} | votes: ${m.vote_count} | pop: ${m.popularity} | kws: ${kws.length} | cast: ${cast.length} | dirs: ${dirs.length}`);
  }

  console.log('\n--- 2. LIGHT META INSPECTION (getDuckDbCatalogFromPreset) ---');
  const lightMetas = await getDuckDbCatalogFromPreset({ type: 'movie', where: [F.minVotes(1000)], orderBy: S.POPULAR }, 0, 5);
  const firstLight = lightMetas[0];
  console.log('Light Meta top-level keys:', Object.keys(firstLight));
  console.log('Light Meta rawTMDB keys:', Object.keys(firstLight.rawTMDB));
  console.log('Preserved in rawTMDB:');
  console.log('  vote_count present?', 'vote_count' in firstLight.rawTMDB, `(val: ${firstLight.rawTMDB.vote_count})`);
  console.log('  keywords present?', 'keywords' in firstLight.rawTMDB, `(val: ${firstLight.rawTMDB.keywords})`);
  console.log('  credits present?', 'credits' in firstLight.rawTMDB, `(val: ${firstLight.rawTMDB.credits})`);
  console.log('  vote_average present?', 'vote_average' in firstLight.rawTMDB, `(val: ${firstLight.rawTMDB.vote_average})`);

  console.log('\n--- 3. SCORING COMPARISON ON REAL PARQUET ITEMS ---');
  // Profile interested in Sci-Fi (878) and specific keywords (e.g. time travel / space)
  const kwTimeTravel = { id: 4379, name: 'time travel' };
  const kwSpace = { id: 9882, name: 'space' };
  const hVec = HierarchicalGraph.vectorizeKeywords([kwTimeTravel, kwSpace]);
  const vFinal = {
    'g:878': 50,
    ...Object.fromEntries(Object.entries(hVec).map(([k, v]) => [k, v * 35]))
  };
  const profile = { compiledVectors: { V_final: vFinal } };

  // Select 10 movies from movies table that are Sci-Fi or have keywords
  const candidateRows = await duckDbStore.query(`
    SELECT id, title, vote_average, vote_count, popularity, genres, keywords, "cast", directors 
    FROM movies 
    WHERE genres ILIKE '%Science Fiction%'
    ORDER BY popularity DESC 
    LIMIT 10
  `);

  console.log(`\nEvaluating ${candidateRows.length} real candidates under VSM:`);
  const results = [];

  for (const row of candidateRows) {
    const parsedGenres = JSON.parse(row.genres || '[]');
    const parsedKeywords = JSON.parse(row.keywords || '[]');
    const parsedCast = JSON.parse(row.cast || '[]');
    const parsedDirs = JSON.parse(row.directors || '[]');

    // 1. As currently passed in buildFilteredCatalog:
    const lightRawTMDB = {
      id: row.id,
      title: row.title,
      overview: row.overview,
      vote_average: row.vote_average,
      popularity: row.popularity,
      genres: parsedGenres
      // Missing: vote_count, keywords, credits
    };

    // 2. Fully hydrated as stored in parquet:
    const fullItem = {
      id: row.id,
      title: row.title,
      overview: row.overview,
      vote_average: row.vote_average,
      vote_count: Number(row.vote_count),
      popularity: row.popularity,
      genres: parsedGenres,
      genre_ids: parsedGenres.map(g => g.id),
      keywords: { results: parsedKeywords },
      credits: {
        cast: parsedCast,
        crew: parsedDirs.map(d => ({ ...d, job: 'Director' }))
      }
    };

    const lightScore = ProfileScorer.calculateItemMatch(lightRawTMDB, profile, {});
    const fullScore = ProfileScorer.calculateItemMatch(fullItem, profile, {});

    results.push({
      id: row.id,
      title: row.title,
      realVotes: Number(row.vote_count),
      realRating: row.vote_average,
      numKeywords: parsedKeywords.length,
      hasTargetKw: parsedKeywords.some(k => k.name.includes('time') || k.name.includes('space')),
      lightScore: Number(lightScore.toFixed(3)),
      fullScore: Number(fullScore.toFixed(3)),
      scoreDiff: Number((fullScore - lightScore).toFixed(3))
    });
  }

  console.table(results);

  // Sorting order comparison:
  const sortedByLight = [...results].sort((a, b) => b.lightScore - a.lightScore).map(r => r.title);
  const sortedByFull = [...results].sort((a, b) => b.fullScore - a.fullScore).map(r => r.title);

  console.log('\n--- 4. RANKING COMPARISON (TOP 5) ---');
  console.log('RANKING WITH CURRENT LIGHT META:');
  sortedByLight.slice(0, 5).forEach((t, i) => console.log(`  ${i + 1}. ${t} (Score: ${results.find(r => r.title === t).lightScore})`));
  console.log('\nRANKING WITH FULL PARQUET METADATA:');
  sortedByFull.slice(0, 5).forEach((t, i) => console.log(`  ${i + 1}. ${t} (Score: ${results.find(r => r.title === t).fullScore})`));

  duckDbStore.close();
})().catch(e => {
  console.error('PROBE ERROR:', e);
  process.exit(1);
});
