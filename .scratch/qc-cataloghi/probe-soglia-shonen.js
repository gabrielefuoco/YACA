/** Quanto pool perde anime_shonen rimettendo il pavimento di 50 voti del ticket 35? */
const store = require('../../src/db/duckDbStore');
const { getPresets } = require('../../src/data/presets');
const { buildPresetFromFilters } = require('../../src/catalog/providers/DuckDbProvider');

(async () => {
    await store.init();
    const p = getPresets().find(x => x.id === 'preset_anime_shonen');
    for (const soglia of [30, 40, 50]) {
        const q = { ...p.queries[0], 'vote_count.gte': soglia };
        const duck = buildPresetFromFilters(q, p.type);
        const where = ['adult = false', ...duck.where].join(' AND ');
        const res = await store.query(`SELECT count(*) AS n FROM tv WHERE ${where}`);
        const med = await store.query(`SELECT median(vote_average) AS m FROM tv WHERE ${where}`);
        console.log(`soglia ${soglia}: pool ${res[0].n} · voto mediano ${Number(med[0].m).toFixed(2)}`);
    }
    process.exit(0);
})();
