/**
 * .scratch/livello-latente/measure.js
 *
 * Misura il disallineamento id/nome nell'etichettatura delle keyword del DNA.
 *
 * Due ordini di esecuzione, gli stessi dati:
 *   freddo = il DNA del profilo si costruisce PRIMA che gli item siano etichettati
 *   caldo  = gli item si etichettano prima (come fa lo scorer reale), poi il DNA
 *
 * Uso: node .scratch/livello-latente/measure.js [freddo|caldo] <out.json>
 */
const fs = require('fs');
const path = require('path');
const duckdb = require('duckdb');
const dna = require('../../src/dna/dnaEngine.js');
const graph = require('../../src/engines/graph/HierarchicalGraph.js');
const ProfileScorer = require('../../src/profile/ProfileScorer.js');
const { getPresets } = require('../../src/data/presets.js');

const MODE = process.argv[2] === 'caldo' ? 'caldo' : 'freddo';
const OUT = process.argv[3] || path.join(__dirname, 'runs', `${MODE}.json`);
const PER_PRESET = 400;
// Da `.scratch/livello-latente/` la radice del repo è due livelli sopra.
const PARQUET = path.join(__dirname, '../../.cache/tmdb/movies.parquet').replace(/\\/g, '/');

const keywordsOf = row => {
    try {
        const p = typeof row.keywords === 'string' ? JSON.parse(row.keywords) : row.keywords;
        return Array.isArray(p) ? p.filter(k => k && k.name) : [];
    } catch (_e) { return []; }
};
const genreIdsOf = row => {
    try {
        const p = typeof row.genres === 'string' ? JSON.parse(row.genres) : row.genres;
        return (Array.isArray(p) ? p : []).map(g => Number(g.id ?? g)).filter(Number.isFinite);
    } catch (_e) { return []; }
};
const median = values => {
    if (!values.length) return 0;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const countKeys = v => {
    const keys = Object.keys(v);
    return {
        total: keys.length,
        numeric: keys.filter(k => /^k:\d+$/.test(k)).length,
        named: keys.filter(k => k.startsWith('k:') && !/^k:\d+$/.test(k)).length,
        levels: keys.filter(k => /^L[1-5]:/.test(k)).length
    };
};

const db = new duckdb.Database(':memory:');
(async () => {
    // WITH_MAP=1 accende la mappa id<->nome dal dump reale, come fa il server all'avvio.
    if (process.env.WITH_MAP === '1') await require('./bootstrap-map.js')();
    db.all(`SELECT id, genres, keywords, popularity FROM read_parquet('${PARQUET}')
        WHERE keywords IS NOT NULL AND keywords <> '[]' AND genres IS NOT NULL
        ORDER BY popularity DESC LIMIT 4000`, (err, rows) => {
    if (err) { console.error('ERR', err.message); process.exit(1); }

    const presets = getPresets().filter(p => (p.queries || []).some(q => q.with_keywords && q.with_genres));

    // Pool per preset (deterministico)
    const pools = new Map();
    for (const preset of presets) {
        const q = preset.queries.find(x => x.with_keywords && x.with_genres);
        const gs = new Set(String(q.with_genres).split(/[,|]/).map(s => Number(s.trim())).filter(Number.isFinite));
        const items = rows.filter(r => genreIdsOf(r).some(g => gs.has(g))).slice(0, PER_PRESET);
        if (items.length >= 30) pools.set(preset.id, { preset, items });
    }

    // ORDINE: è l'unica differenza fra le due modalità
    if (MODE === 'caldo') {
        for (const { items } of pools.values()) items.forEach(r => graph.vectorizeKeywords(keywordsOf(r)));
    }

    // DNA dei profili freddi (id numerici, come li passa ProfileBuilder e come stanno nei preset)
    const dnaByPreset = new Map();
    for (const [id, { preset }] of pools) {
        const vFinal = dna.computeFinalDNA(dna.extractStaticDNAFromQueries(preset.queries), {}, 0);
        dnaByPreset.set(id, { vFinal, keys: countKeys(vFinal) });
    }

    const report = { mode: MODE, presets: [] };
    for (const [id, { preset, items }] of pools) {
        const { vFinal, keys } = dnaByPreset.get(id);
        const scored = [];
        let withKwMatch = 0;
        const kwShares = [], itemKeyCounts = [];
        for (const row of items) {
            const hVector = graph.vectorizeKeywords(keywordsOf(row));
            itemKeyCounts.push(countKeys(hVector));
            const total = ProfileScorer._computeThematicScoreForVector(vFinal, genreIdsOf(row), hVector);
            let kwPart = 0, matched = 0;
            for (const [key, weight] of Object.entries(hVector)) {
                const affinity = vFinal[key];
                if (affinity) { kwPart += affinity * weight; matched++; }
            }
            if (matched > 0) withKwMatch++;
            kwShares.push(total > 0 ? kwPart / total : 0);
            scored.push({ id: Number(row.id), score: total });
        }
        scored.sort((a, b) => (b.score - a.score) || (a.id - b.id));
        report.presets.push({
            id, name: preset.name,
            items: items.length,
            dnaKeys: keys,
            itemKeysMedian: {
                total: median(itemKeyCounts.map(k => k.total)),
                named: median(itemKeyCounts.map(k => k.named)),
                levels: median(itemKeyCounts.map(k => k.levels))
            },
            itemsWithKwMatch: withKwMatch,
            medianThematic: median(scored.map(s => s.score)),
            medianKwShare: median(kwShares),
            top50: scored.slice(0, 50).map(s => s.id)
        });
    }

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(`\n== ${MODE.toUpperCase()} — ${report.presets.length} preset ==`);
    const tot = report.presets.reduce((a, p) => a + p.items, 0);
    const kw = report.presets.reduce((a, p) => a + p.itemsWithKwMatch, 0);
    const dnaNames = report.presets.reduce((a, p) => a + p.dnaKeys.named, 0);
    const dnaLevels = report.presets.reduce((a, p) => a + p.dnaKeys.levels, 0);
    const itemNames = median(report.presets.map(p => p.itemKeysMedian.named));
    const itemLevels = median(report.presets.map(p => p.itemKeysMedian.levels));
    console.log(`DNA — chiavi a parole: ${dnaNames} · chiavi gerarchiche: ${dnaLevels}`);
    console.log(`Item — per item (mediana): ${itemNames} chiavi a parole · ${itemLevels} chiavi gerarchiche`);
    console.log(`Item con almeno un match keyword/gerarchia: ${kw}/${tot} (${Math.round(100 * kw / tot)}%)`);
    console.log(`Quota keyword del punteggio tematico (mediana): ${(100 * median(report.presets.map(p => p.medianKwShare))).toFixed(1)}%`);
    console.log(`Scritto: ${OUT}`);
});
})();
