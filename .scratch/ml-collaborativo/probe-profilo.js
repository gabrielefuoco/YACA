const fs=require('fs'),path=require('path'),duckdb=require('duckdb');
const graph=require('../../src/engines/graph/HierarchicalGraph');
const dna=require('../../src/dna/dnaEngine.js');
const ocean=require('../ocean-prototipo/ocean-core.js');
const CACHE=path.join(__dirname,'../../.cache/movielens'),PARDIR=path.join(__dirname,'../../.cache/tmdb');
const all=(db,sql)=>new Promise((res,rej)=>db.all(sql,(e,r)=>(e?rej(e):res(r))));
const parse=v=>(typeof v==='string'?JSON.parse(v):v);
(async()=>{
 await require('../livello-latente/bootstrap-map.js')();
 const db=new duckdb.Database(':memory:');
 const rows=[...(await all(db,`SELECT id, title AS name, genres, keywords, vote_count FROM read_parquet('${PARDIR}/movies.parquet') ORDER BY popularity DESC LIMIT 12000`)).map(r=>({...r,type:'movie'})),
   ...(await all(db,`SELECT id, name, genres, keywords, vote_count FROM read_parquet('${PARDIR}/tv.parquet') ORDER BY popularity DESC LIMIT 6000`)).map(r=>({...r,type:'tv'}))];
 const items=new Map();
 for(const r of rows){const it={type:r.type,id:Number(r.id),name:r.name,genres:parse(r.genres)||[],keywords:parse(r.keywords)||[],voteCount:Number(r.vote_count)||0};
  it.genreIds=it.genres.map(g=>Number(g.id??g));items.set(`${it.type}:${it.id}`,it);}
 const t=JSON.parse(fs.readFileSync(path.join(CACHE,'graph-candidates-synth.json'),'utf8'))[0];
 const seeds=t.seeds.map(k=>items.get(k)).filter(Boolean);
 console.log(`trial ${t.ctx} · semi ${t.seeds.length} · semi trovati nel pool proxy ${seeds.length}`);
 const s0=seeds[0];
 console.log(`primo seme: ${s0.name} · generi ${JSON.stringify(s0.genreIds)} · keywords grezze ${JSON.stringify((s0.keywords||[]).slice(0,3))}`);
 const kws=ocean.keywordsOf(s0);
 console.log(`ocean.keywordsOf -> ${kws.length} keyword: ${JSON.stringify(kws.slice(0,3))}`);
 const raw={};
 for(const item of seeds){const kk=ocean.keywordsOf(item);
  const vec=dna.extractActiveDNAFromTmdbData({genre_ids:item.genreIds,origin_country:[],keywords:{results:kk},keyword_ids:kk.map(x=>String(x.id))},100);
  for(const [k,v] of Object.entries(vec))raw[k]=(raw[k]||0)+v;}
 const prof=dna.computeFinalDNA({},dna.computeActiveDNA(raw),seeds.length*3);
 const byP={};for(const k of Object.keys(prof)){const p=k.split(':')[0];byP[p]=(byP[p]||0)+1;}
 console.log(`DNA grezzo: ${Object.keys(raw).length} chiavi · profilo finale ${Object.keys(prof).length} chiavi · prefissi ${JSON.stringify(byP)}`);
 console.log(`esempi di chiavi: ${JSON.stringify(Object.keys(prof).slice(0,8))}`);
 const L2=Object.entries(prof).filter(([k])=>k.startsWith('L2:')).slice(0,3);
 console.log(`nodi L2 nel profilo: ${L2.length} ${JSON.stringify(L2)}`);
 if(L2.length){const m=graph.getKeywordsForNodes(L2.map(([k])=>k.slice(3)),'L2');
  let tot=0,num=0,esempi=[];
  for(const kws2 of m.values())for(const kw of kws2){tot++;if(esempi.length<4)esempi.push(kw);if(/^\d+$/.test(String(kw)))num++;}
  console.log(`getKeywordsForNodes(L2) -> ${tot} keyword · numeriche ${num} · esempi ${JSON.stringify(esempi)}`);}
 db.close();process.exit(0);
})().catch(e=>{console.error('ERR',e.message,e.stack.split('\n')[1]);process.exit(1);});
