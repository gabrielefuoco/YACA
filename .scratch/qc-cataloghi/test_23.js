const store = require('../../src/db/duckDbStore');
const { getPresets } = require('../../src/data/presets');
const { buildPresetFromFilters } = require('../../src/catalog/providers/DuckDbProvider');

async function test23() {
    await store.init();
    const presets = getPresets();

    const ids = [
      'preset_new_series_eps', 'preset_doc_food_travel', 'preset_donghua', 'preset_sports_docs',
      'preset_doc_history_war', 'preset_sea_series_docs', 'preset_turkish_dizi', 'preset_true_crime',
      'preset_anime_kids_series', 'preset_space_docs', 'preset_sketch_comedy', 'preset_nordic_noir',
      'preset_sea_movie_docs', 'preset_stand_up', 'preset_italian_comedy', 'preset_new_series',
      'preset_kdrama_thriller', 'preset_german_dark', 'preset_reality_shows', 'preset_nature_series_docs',
      'preset_anthology', 'preset_bollywood', 'preset_teen_preteen_tv'
    ];

    for (const id of ids) {
        const p = presets.find(x => x.id === id);
        const q = p.queries[0];
        console.log(`\n=== ${id} (${p.name}) ===`);
        console.log(`Current: sort_by=${q.sort_by}, vote_count.gte=${q['vote_count.gte']}`);
        
        // Test with vote_count.gte: 50
        const q50 = { ...q, 'vote_count.gte': 50 };
        const duck50 = buildPresetFromFilters(q50, p.type);
        const table = p.type === 'movie' ? 'movies' : 'tv';
        const where50 = ['adult = false', ...duck50.where].join(' AND ');
        const r50 = await store.query(`SELECT count(*) as n FROM ${table} WHERE ${where50}`);
        console.log(`  Pool if vote_count >= 50: ${r50[0].n}`);

        // If currently vote_average.desc, test with popularity.desc
        if (q.sort_by === 'vote_average.desc') {
            const qPop = { ...q, sort_by: 'popularity.desc' };
            const duckPop = buildPresetFromFilters(qPop, p.type);
            const wherePop = ['adult = false', ...duckPop.where].join(' AND ');
            const rPop = await store.query(`SELECT count(*) as n FROM ${table} WHERE ${wherePop}`);
            console.log(`  Pool if popularity.desc: ${rPop[0].n}`);
        }
    }
}

test23().catch(console.error);
