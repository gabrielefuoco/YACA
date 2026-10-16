// Quanto cambiava la diffusione col salto UNIFORME invece dei pesi veri?
const B = require('../src/engines/bolle/Bolle');
const d = B.loadData();
const N = B.nBolle, v = d.versione;

function attiva({pesata}) {
    const seme = new Float64Array(N); let tot = 0;
    for (const voce of [{chiave:'tv:314',plays:3,tipo:'loved'},{chiave:'tv:1396',plays:1,tipo:'watched'},
                        {chiave:'movie:603',plays:2,tipo:'liked'}]) {
        const b = B.bollaDi(voce.chiave); if (b === undefined) continue;
        const w = B.peso(voce.chiave, voce.plays, voce.tipo);
        seme[b] += w; tot += w;
    }
    for (let b = 0; b < N; b++) seme[b] /= tot;
    let r = Float64Array.from(seme);
    for (let it = 0; it < v.iterazioni; it++) {
        const nuovo = new Float64Array(N);
        for (let b = 0; b < N; b++) {
            if (r[b] === 0) continue;
            const riga = (d.bolle[String(b)] || {}).P || [];
            if (pesata) { for (const [dest, w] of riga) nuovo[dest] += r[b] * w; }
            else {                                   // il salto che c'era prima: parti uguali, no auto-anello
                const vic = riga.filter(([dest]) => dest !== b).map(([dest]) => dest);
                if (!vic.length) { nuovo[b] += r[b]; continue; }
                for (const j of vic) nuovo[j] += r[b] / vic.length;
            }
        }
        for (let b = 0; b < N; b++) r[b] = v.alpha * seme[b] + (1 - v.alpha) * nuovo[b];
    }
    const s = r.reduce((a, x) => a + x, 0) || 1;
    return Array.from(r).map((x, b) => [b, x/s]).filter(x => x[1] > 0).sort((a,b) => b[1]-a[1]);
}
const t0 = Date.now(); const nuovo = attiva({pesata:true}); const t1 = Date.now();
const vecchio = attiva({pesata:false}); const t2 = Date.now();
const top = (a, n) => a.slice(0,n).map(x => x[0]);
const A = new Set(top(vecchio,10)), C = new Set(top(nuovo,10));
const jac = [...A].filter(x => C.has(x)).length / new Set([...A,...C]).size;
console.log(`  top-5 VECCHIO (uniforme): ${top(vecchio,5).join(' · ')}`);
console.log(`  top-5 NUOVO (pesato):     ${top(nuovo,5).join(' · ')}`);
console.log(`  mondo acceso al 1. posto: vecchio ${vecchio[0][0]} ${(100*vecchio[0][1]).toFixed(1)}%  ->  nuovo ${nuovo[0][0]} ${(100*nuovo[0][1]).toFixed(1)}%`);
console.log(`  Jaccard sui primi 10 mondi: ${jac.toFixed(2)}   ·   posizioni cambiate: ${10 - [...A].filter(x => C.has(x)).length}/10`);
console.log(`  tempo: pesata ${t1-t0} ms · uniforme ${t2-t1} ms  (20 iterazioni su ${N.toLocaleString()} bolle)`);
console.log(`  artefatto: ${(require('fs').statSync('../src/data/bolle.json').size/1048576).toFixed(2)} MB · ricetta ${v.ricetta}`);
