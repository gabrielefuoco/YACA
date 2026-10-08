const [fileA, fileB] = process.argv.slice(2);
const A = require('./runs/' + fileA), B = require('./runs/' + fileB);
const jac = (a,b) => { const S=new Set(a), T=new Set(b); let i=0; for(const x of S) if(T.has(x)) i++; const u=new Set([...S,...T]).size; return u? i/u : 1; };
const med = a => { const s=[...a].sort((x,y)=>x-y); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; };
const byId = new Map(B.presets.map(p=>[p.id,p]));
const rows=[];
for (const a of A.presets) {
  const b = byId.get(a.id); if(!b) continue;
  let moved=0; for(let i=0;i<50;i++) if(a.top50[i]!==b.top50[i]) moved++;
  rows.push({ name:a.name, j:jac(a.top50,b.top50), moved,
    kwA:a.itemsWithKwMatch/a.items, kwB:b.itemsWithKwMatch/b.items,
    dnaA:a.dnaKeys.named+a.dnaKeys.levels, dnaB:b.dnaKeys.named+b.dnaKeys.levels });
}
const identical = rows.filter(r=>r.j===1).length;
console.log(`\n== ${fileA}  vs  ${fileB} ==`);
console.log(`Jaccard top-50 (mediana su ${rows.length} preset): ${(100*med(rows.map(r=>r.j))).toFixed(0)}%`);
console.log(`Posizioni cambiate nella top-50 (mediana): ${med(rows.map(r=>r.moved)).toFixed(0)}/50`);
console.log(`Preset con top-50 IDENTICA: ${identical}/${rows.length}  ·  con sovrapposizione < 60%: ${rows.filter(r=>r.j<0.6).length}/${rows.length}`);
console.log(`Chiavi DNA a nome+gerarchia: ${(med(rows.map(r=>r.dnaA)))} -> ${(med(rows.map(r=>r.dnaB)))}`);
console.log(`Item con match keyword (mediana): ${(100*med(rows.map(r=>r.kwA))).toFixed(0)}% -> ${(100*med(rows.map(r=>r.kwB))).toFixed(0)}%`);
const worst = [...rows].sort((a,b)=>a.j-b.j).slice(0,3);
console.log(`Peggiori: ${worst.map(r=>`${r.name} ${(100*r.j).toFixed(0)}%`).join(' · ')}`);
