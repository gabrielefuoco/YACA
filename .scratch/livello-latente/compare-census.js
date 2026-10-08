/**
 * .scratch/livello-latente/compare-census.js
 *
 * Il "prima/dopo" della ricostruzione: confronta due censimenti dei vettori DNA
 * (`.scratch/livello-latente/census-dna.js`) e dice cosa è cambiato in ogni profilo.
 *
 * La misura che conta: le chiavi `k:<nome>` e i livelli L1-L5 devono salire fino a
 * coprire le `k:<numero>`, perché solo le prime possono incontrare l'etichettatura
 * dell'item. Se restano numeriche, quel peso è morto nel punteggio.
 *
 * Uso: node .scratch/livello-latente/compare-census.js runs/census-prima.json runs/census-dopo.json
 */
const path = require('path');

const [fileA, fileB] = process.argv.slice(2);
if (!fileA || !fileB) {
    console.error('Uso: node compare-census.js <census-prima.json> <census-dopo.json>');
    process.exit(1);
}
const load = f => require(path.isAbsolute(f) ? f : path.resolve(f));
const A = load(fileA), B = load(fileB);

const key = r => `${r.owner}/${r.context}`;
const bByKey = new Map(B.rows.map(r => [key(r), r]));

console.log(`\n== RICOSTRUZIONE DNA: prima (${A.when.slice(0, 16)}) -> dopo (${B.when.slice(0, 16)}) ==\n`);
console.log(`| profilo | V_final | k:nome prima -> dopo | livelli prima -> dopo | k:num prima -> dopo |`);
console.log(`|---|---|---|---|---|`);

let allImproved = true;
for (const a of A.rows) {
    const b = bByKey.get(key(a));
    if (!b) { console.log(`| ${key(a)} | ASSENTE DOPO | | | |`); allImproved = false; continue; }
    const arrow = (x, y) => `${x} -> ${y}${y > x ? ' ✅' : (y < x ? ' ⚠️' : '')}`;
    const namedOk = b.final.kNamed >= a.final.kNum * 0.95;
    if (!namedOk) allImproved = false;
    console.log(`| ${key(a)} | ${a.final.total} -> ${b.final.total}`
        + ` | ${arrow(a.final.kNamed, b.final.kNamed)}`
        + ` | ${arrow(a.final.levels, b.final.levels)}`
        + ` | ${arrow(a.final.kNum, b.final.kNum)} |`);
}

const sum = (report, sel) => report.rows.reduce((acc, r) => acc + sel(r), 0);
console.log(`\nTotali — k a nome: ${sum(A, r => r.final.kNamed)} -> ${sum(B, r => r.final.kNamed)}`
    + ` · livelli: ${sum(A, r => r.final.levels)} -> ${sum(B, r => r.final.levels)}`);
console.log(`Il fix è arrivato nei documenti: ${allImproved ? 'SÌ — ogni profilo ora ha i nomi che coprono le sue chiavi numeriche' : 'NO — vedi le righe senza ✅'}`);
