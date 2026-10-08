/**
 * Accende la mappa id <-> nome delle keyword usando il CODICE DI PRODUZIONE
 * (`DuckDbStore.buildDfCache`), non una copia della query.
 *
 * Perché non `store.init()`: l'init completo crea le tabelle in RAM e l'indice
 * FTS (minuti). Qui servono solo le due viste che `buildDfCache` legge.
 */
const duckdb = require('duckdb');
const path = require('path');
const store = require('../../src/db/duckDbStore');

// Da `.scratch/livello-latente/` la radice del repo è due livelli sopra.
const CACHE_DIR = path.resolve(__dirname, '../../.cache/tmdb');
module.exports = async function bootstrapMap() {
    const movies = path.join(CACHE_DIR, 'movies.parquet').replace(/\\/g, '/');
    const tv = path.join(CACHE_DIR, 'tv.parquet').replace(/\\/g, '/');

    await new Promise((resolve, reject) => {
        store.db = new duckdb.Database(':memory:', {}, err => (err ? reject(err) : resolve()));
    });
    store.con = store.db.connect();
    const exec = sql => new Promise((res, rej) => store.con.exec(sql, e => (e ? rej(e) : res())));

    await exec(`CREATE VIEW movies AS SELECT * FROM read_parquet('${movies}')`);
    await exec(`CREATE VIEW tv AS SELECT * FROM read_parquet('${tv}')`);
    store.isInitialized = true;
    await store.buildDfCache();

    const { getKeywordNameMaps } = require('../../src/data/keywordIds');
    const maps = getKeywordNameMaps();
    console.log(`[mappa] id->nome: ${maps.idToName ? maps.idToName.size : 0} keyword · nome->id: ${maps.nameToId ? maps.nameToId.size : 0}`);
    console.log(`[mappa] esempio 10364 -> ${maps.idToName ? maps.idToName.get('10364') : null}`);
};
