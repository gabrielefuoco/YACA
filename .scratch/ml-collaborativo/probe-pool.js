const fs=require('fs'),path=require('path'),duckdb=require('duckdb');
const graph=require('C:/Users/gabri/APP/YACA/src/engines/graph/HierarchicalGraph');
const dna=require('C:/Users/gabri/APP/YACA/src/dna/dnaEngine.js');
const ocean=require('C:/Users/gabri/APP/YACA/.scratch/ocean-prototipo/ocean-core.js');
const CACHE='C:/Users/gabri/APP/YACA/.cache/movielens', PARDIR='C:/Users/gabri/APP/YACA/.cache/tmdb';
const all=(db,sql)=>new Promise((res,rej)=>db.all(sql,(e,r)=>(e?rej(e):res(r))));
const parse=v=>(typeof v==='string'?JSON.parse(v):v);
(async()=>{
 await require('C:/Users/gabri/APP/YACA/.scratch/livello-latente/bootstrap-map.js')();
 const db=new duckdb.Database(':memory:');
 const rows=[...(await all(db,`SELECT id, title AS name, genres, keywords, vote_count, popularity FROM read_parquet('${PARDIR}/movies.parquet') ORDER BY popularity DESC LIMIT 12000`)).map(r=>({...r,type:'movie'})),
   ...(await all(db,`SELECT id, name, genres, keywords, vote_count, popularity FROM read_parquet('${PARDIR}/tv.parquet') ORDER BY popularity DESC LIMIT 6000`)).map(r=>({...r,type:'tv'}))];
 const items=new Map();
 for(const r of rows){const it={type:r.type,id:Number(r.id),name:r.name,genres:parse(r.genres)||[],voteCount:Number(r.vote_count)||0};
  it.genreIds=it.genres.map(g=>Number(g.id??g));it.kwNums=new Set(ocean.keywordsOf(it).map(x=>Number(x.id)));items.set(`${it.type}:${it.id}`,it);}
 const trials=JSON.parse(fs.readFileSync(path.join(CACHE,'graph-candidates-synth.json'),'utf8')).slice(0,5);
 for(const t of trials){
  const seeds=t.seeds.map(k=>items.get(k)).filter(Boolean);
  const raw={};for(const item of seeds){const kws=ocean.keywordsOf(item);
   const vec=dna.extractActiveDNAFromTmdbData({genre_ids:item.genreIds,origin_country:[],keywords:{results:kws},keyword_ids:kws.map(k=>String(k.id))},100);
   for(const [k,v] of Object.entries(vec))raw[k]=(raw[k]||0)+v;}
  const profile=dna.computeFinalDNA({},dna.computeActiveDNA(raw),seeds.length*3);
  const genres=Object.entries(profile).filter(([k])=>k.startsWith('g:')).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>Number(k.slice(2)));
  const l2=Object.entries(profile).filter(([k])=>k.startsWith('L2:')).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>k.slice(3));
  let kwN=0,kwTot=0;
  if(l2.length){const map=graph.getKeywordsForNodes(l2,'L2');for(const kws of map.values())for(const kw of kws){kwTot++;if(/^\d+$/.test(String(kw)))kwN++;}}
  const numKws=new Set();if(l2.length){const map=graph.getKeywordsForNodes(l2,'L2');for(const kws of map.values())for(const kw of kws)if(/^\d+$/.test(String(kw)))numKws.add(Number(kw));}
  let kwIds=numKws;
  if(kwIds.size===0)kwIds=new Set(Object.entries(profile).filter(([k])=>k.startsWith('k:')).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k])=>Number(k.slice(2))).filter(Number.isFinite));
  const pool=[...items.keys()].filter(k=>{const it=items.get(k);if(t.seeds.includes(k))return false;
   if(genres.length&&!it.genreIds.some(g=>genres.includes(g)))return false;
   if(kwIds.size&&![...it.kwNums].some(x=>kwIds.has(x)))return false;return true;});
  console.log(`${t.ctx} ${t.strato}: l2=${l2.length} kwTot=${kwTot} kwNumerici=${kwN} -> kwIds=${kwIds.size} | POOL=${pool.length} | twohop=${t.twohop.length} | union~${new Set([...pool,...t.twohop]).size}`);
 }
 db.close();process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
