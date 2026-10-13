/**
 * .scratch/ocean-prototipo/analyze-verdetti.js   —  PROTOTIPO (strumento)
 *
 * Legge i verdetti dei giudici, decodifica la chiave A/B e dice se una dose batte
 * l'altra **oltre il rumore**, usando la banda misurata dalla campagna QC (Δ ≤ 10
 * punti non è un fatto).
 *
 * Il punteggio lo ricalcola qui dalle dimensioni (non si fida dell'aritmetica del
 * giudice): pertinenza = 0,4·filtri + 0,6·nome; score = 0,35·p + 0,20·q + 0,15·d + 0,15·c + 0,15·co.
 *
 * Uso: node .scratch/ocean-prototipo/analyze-verdetti.js [file1.json file2.json ...]
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'runs', 'giudizio');
const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : fs.readdirSync(DIR).filter(f => f.startsWith('verdetti-') && f.endsWith('.json'));

const key = JSON.parse(fs.readFileSync(path.join(DIR, 'chiave.json'), 'utf8'));
const byPair = new Map(key.map(k => [k.coppia, k]));
const doseName = dir => (dir.includes('doseA') ? 'candidata (62%)' : 'produzione (48%)');

const scoreOf = v => {
    const p = 0.4 * Number(v.pertinenza_filtri) + 0.6 * Number(v.pertinenza_nome);
    return 0.35 * p + 0.20 * Number(v.qualita) + 0.15 * Number(v.distintivita) + 0.15 * Number(v.coerenza) + 0.15 * Number(v.completezza);
};
const band = s => (s >= 80 ? 'P' : s >= 60 ? 'B' : 'N');
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const verdicts = [];
for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    const name = file.replace('verdetti-', '').replace('.json', '');
    for (const v of raw) {
        const pair = byPair.get(Number(v.coppia));
        if (!pair) continue;
        const dose = pair[v.lista] === pair.A ? doseName(pair.A) : doseName(pair.B);
        verdicts.push({ giudice: name, coppia: Number(v.coppia), lista: v.lista, dose,
            profile: pair.profile, catalog: pair.catalog,
            score: scoreOf(v), banda: band(scoreOf(v)),
            pertinenza: 0.4 * v.pertinenza_filtri + 0.6 * v.pertinenza_nome,
            qualita: Number(v.qualita), distintivita: Number(v.distintivita), coerenza: Number(v.coerenza),
            completezza: Number(v.completezza), fiducia: v.fiducia || '' });
    }
}

console.log(`\n== VERDETTI: ${verdicts.length} liste giudicate · giudici: ${[...new Set(verdicts.map(v => v.giudice))].join(', ')} ==\n`);

// --- 1. punteggio per dose ---
console.log('| giudice | coppia | catalogo (profilo) | dose | score | banda |');
console.log('|---|---|---|---|---|---|');
for (const v of verdicts.sort((a, b) => a.giudice.localeCompare(b.giudice) || a.coppia - b.coppia || a.lista.localeCompare(b.lista))) {
    console.log(`| ${v.giudice} | ${v.coppia} | ${v.catalog.replace('yaca_', '')} (${v.profile}) | ${v.dose} | **${v.score.toFixed(1)}** | ${v.banda} |`);
}

// --- 2. per coppia: differenza fra le dosi ---
const pairs = [...new Set(verdicts.map(v => v.coppia))];
const deltas = [];
console.log('\n== DIFFERENZA FRA LE DOSI, per coppia ==\n');
console.log('| coppia | catalogo | score produzione | score candidata | delta (cand − prod) | banda |');
console.log('|---|---|---|---|---|---|');
for (const p of pairs) {
    const rows = verdicts.filter(v => v.coppia === p);
    const prod = mean(rows.filter(r => r.dose.startsWith('produzione')).map(r => r.score));
    const cand = mean(rows.filter(r => r.dose.startsWith('candidata')).map(r => r.score));
    deltas.push(cand - prod);
    console.log(`| ${p} | ${rows[0].catalog.replace('yaca_', '')} | ${prod.toFixed(1)} | ${cand.toFixed(1)} | ${cand - prod > 0 ? '+' : ''}${(cand - prod).toFixed(1)} | ${band(prod)} → ${band(cand)} |`);
}
const meanDelta = mean(deltas);
console.log(`\ndelta medio della dose candidata: **${meanDelta > 0 ? '+' : ''}${meanDelta.toFixed(1)} punti** · coppie in cui vince: ${deltas.filter(d => d > 0).length}/${deltas.length}`);
console.log(`banda di rumore della rubrica (campagna QC): Δ ≤ 10 punti NON è un fatto`);

// --- 3. rumore fra giudici sulle stesse liste ---
const judges = [...new Set(verdicts.map(v => v.giudice))];
if (judges.length > 1) {
    const [j1, j2] = judges;
    const inter = [];
    for (const p of pairs) {
        for (const lista of ['A', 'B']) {
            const a = verdicts.find(v => v.giudice === j1 && v.coppia === p && v.lista === lista);
            const b = verdicts.find(v => v.giudice === j2 && v.coppia === p && v.lista === lista);
            if (a && b) inter.push(Math.abs(a.score - b.score));
        }
    }
    console.log(`\n== RUMORE FRA I DUE GIUDICI (stesse liste) ==\n`);
    console.log(`Δ medio assoluto: **${mean(inter).toFixed(1)} punti** · Δ massimo: ${Math.max(...inter).toFixed(1)} · coppie confrontate: ${inter.length}`);
    console.log(inter.every(d => d <= 10) ? '→ dentro la banda dichiarata dalla campagna (≤ 10)' : '→ SOPRA la banda: i punteggi sono più rumorosi della rubrica v2');
}
