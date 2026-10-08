/**
 * .scratch/livello-latente/probe-cache.js
 *
 * La prova minima del difetto, e della sua correzione. Stesse keyword dello
 * stesso film (tmdb 27205), passate come SOLI ID — la forma che usano preset,
 * parquet e ProfileBuilder. Cambia solo lo stato del processo.
 *
 *   freddo  = prima chiamata in assoluto
 *   caldo   = lo stesso id è già stato visto come oggetto {id,name}
 *   mappa   = mappa id->nome caricata (come fa il dump all'avvio)
 *
 * Prima del fix: freddo 14 chiavi / 0 livelli, caldo 74 chiavi / 28 livelli.
 * Dopo il fix:   freddo e caldo identici (14 / 0); con la mappa 74 / 28 per tutti.
 *
 * Uso: node .scratch/livello-latente/probe-cache.js [freddo|caldo|mappa]
 */
const duckdb = require('duckdb');
const graph = require('../../src/engines/graph/HierarchicalGraph');
const { setKeywordNameMaps } = require('../../src/data/keywordIds');

const MODE = process.argv[2] || 'freddo';

const db = new duckdb.Database(':memory:');
db.all(`SELECT keywords FROM read_parquet('.cache/tmdb/movies.parquet') WHERE id = 27205`, (err, rows) => {
    if (err) { console.log('ERR', err.message); return; }
    const kws = JSON.parse(rows[0].keywords);
    const ids = kws.map(k => k.id);

    if (MODE === 'caldo') {
        // L'oggetto passa per primo: è ciò che fa lo scorer sugli item del parquet.
        graph.vectorizeKeywords(kws);
    }
    if (MODE === 'mappa') {
        setKeywordNameMaps({
            idToName: new Map(kws.map(k => [String(k.id), String(k.name).toLowerCase()])),
            nameToId: new Map(kws.map(k => [String(k.name).toLowerCase(), String(k.id)]))
        });
        graph.invalidateKeywordCaches();
    }

    const vector = graph.vectorizeKeywords(ids);
    const keys = Object.keys(vector);
    const count = prefix => keys.filter(k => k.startsWith(`${prefix}:`)).length;
    console.log(
        `${MODE.toUpperCase().padEnd(7)}| chiavi: ${String(keys.length).padStart(3)}`
        + ` | k: ${String(count('k')).padStart(3)}`
        + ` | L1: ${count('L1')} L2: ${count('L2')} L3: ${count('L3')}`
        + ` | es: ${keys.slice(0, 3).join(' ')}`
    );
});
