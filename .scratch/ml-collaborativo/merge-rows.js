/**
 * .scratch/ml-collaborativo/merge-rows.js
 *
 * Unisce le righe prodotte da piu' processi del banco (SLICE=a:b ROWS_OUT=file) e stampa le
 * STESSE tabelle del banco sequenziale. Le righe sono per trial e indipendenti, quindi unire
 * e' corretto per costruzione: l'unica cosa che cambia rispetto al sequenziale e' il seme dei
 * controlli casuali, che ora e' per trial (dipende dal ctx, non dalla posizione).
 *
 * Uso: node merge-rows.js rows-0.json rows-1.json ...
 */
const fs = require('fs');

const files = process.argv.slice(2);
if (!files.length) { console.error('servono i file delle righe'); process.exit(1); }
const rowsOut = files.flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const bySource = new Map();
for (const r of rowsOut) {
    if (!bySource.has(r.source)) bySource.set(r.source, []);
    bySource.get(r.source).push(r);
}
const ctxs = new Set(rowsOut.map(r => r.ctx));
console.log(`\n== IL GRAFO DAVANTI ALLO SCORER, A PARITA' DI BUDGET (${ctxs.size} trial, ${files.length} processi) ==\n`);
console.log('| sorgente di candidati | candidati (mediana) | recall@50 | recall@200 | se ordinassi per POPOLARITÀ | voti mediani | ≥1000 voti |');
console.log('|---|---|---|---|---|---|---|');
for (const name of ['graph 1 hop', 'CASO = |1 hop| dal pool vero', 'graph 2 hop', 'CASO = |2 hop| dal pool vero', 'graph cluster+vicini', 'POOL VERO (fetchSmartAndPool)', 'pool proxy (generi condivisi)']) {
    const g = bySource.get(name);
    if (!g) continue;
    const p = n => `${(100 * mean(g.map(r => r[n]).filter(v => v !== null))).toFixed(1)}%`;
    console.log(`| ${name} | ${median(g.map(r => r.size))} | ${p('r50')} | ${p('r200')} | ${p('pop50')} | ${median(g.map(r => r.medVotes))} | ${(100 * mean(g.map(r => r.popWins))).toFixed(0)}% |`);
}

const strata = [...new Set(rowsOut.map(r => r.strato).filter(s => s && s !== '?'))];
if (strata.length > 1) {
    console.log(`\n== PER STRATO (il 'fondo' e' il meno mainstream dello strumento) ==`);
    console.log('| strato | sorgente | candidati | recall@50 | recall@200 | solo popolarità |');
    console.log('|---|---|---|---|---|---|');
    for (const st of strata.sort()) {
        for (const name of ['graph 2 hop', 'CASO = |2 hop| dal pool vero', 'POOL VERO (fetchSmartAndPool)']) {
            const g = rowsOut.filter(r => r.strato === st && r.source === name);
            if (!g.length) continue;
            const p = n => `${(100 * mean(g.map(r => r[n]).filter(v => v !== null))).toFixed(1)}%`;
            console.log(`| ${st} | ${name} | ${median(g.map(r => r.size))} | ${p('r50')} | ${p('r200')} | ${p('pop50')} |`);
        }
    }
}
