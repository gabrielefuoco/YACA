const fs = require('fs');
const path = require('path');

const analysis = JSON.parse(fs.readFileSync('.scratch/qc-cataloghi/runs/hero-coldstart-run/coldstart-analysis.json', 'utf8'));

console.log('=== 1. TABELLA STRUTTURALE COMPLETA (48 COMBINAZIONI) ===');
console.log('| Profilo | Hero | Item | Anime% | ITA% | Rating med | Anno med | Pop med | Jaccard Pop (comuni/40) | Jaccard TR (comuni/40) |');
console.log('|---|---|---|---|---|---|---|---|---|---|');

for (const r of analysis.results) {
    const popStr = `${(r.jaccardPop * 100).toFixed(1)}% (${r.commonPop}/40)`;
    const trStr = `${(r.jaccardTopRated * 100).toFixed(1)}% (${r.commonTopRated}/40)`;
    const heroShort = r.hero.replace('yaca_', '');
    console.log(`| ${r.profile} | ${heroShort} | ${r.itemCount} | ${r.animePercent.toFixed(1)}% | ${r.itaPercent.toFixed(1)}% | ${r.medianRating?.toFixed(1) ?? 'n/d'} | ${r.medianYear ?? 'n/d'} | ${r.medianPop?.toFixed(1) ?? 'n/d'} | ${popStr} | ${trStr} |`);
}

console.log('\n=== 2. INVARIANTE DI DISGIUNZIONE (PAIRWISE OVERLAP) ===');
for (const [prof, data] of Object.entries(analysis.disjointnessReport)) {
    console.log(`\nProfilo: ${prof}`);
    console.log('  Movies:');
    for (const ov of data.movie) {
        if (ov.sharedCount > 0) {
            console.log(`    ⚠️ OVERLAP: ${ov.pair} -> ${ov.sharedCount} titoli condivisi: ${ov.sharedIds.join(', ')}`);
        } else {
            console.log(`    ✓ ${ov.pair}: 0 condivisi`);
        }
    }
    console.log('  Series:');
    for (const ov of data.series) {
        if (ov.sharedCount > 0) {
            console.log(`    ⚠️ OVERLAP: ${ov.pair} -> ${ov.sharedCount} titoli condivisi: ${ov.sharedIds.join(', ')}`);
        } else {
            console.log(`    ✓ ${ov.pair}: 0 condivisi`);
        }
    }
}
