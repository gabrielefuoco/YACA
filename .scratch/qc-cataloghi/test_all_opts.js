const store = require('../../src/db/duckDbStore');
const { getPresets } = require('../../src/data/presets');
const { buildPresetFromFilters } = require('../../src/catalog/providers/DuckDbProvider');

async function testAllOptions() {
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

    async function evaluate(id, queryOverride) {
        const p = presets.find(x => x.id === id);
        const q = { ...p.queries[0], ...queryOverride };
        const duck = buildPresetFromFilters(q, p.type);
        const table = p.type === 'movie' ? 'movies' : 'tv';
        const where = ['adult = false', ...duck.where].join(' AND ');
        const poolRes = await store.query(`SELECT count(*) as n FROM ${table} WHERE ${where}`);
        const pool = Number(poolRes[0]?.n);
        
        // top 50 items
        const top50 = await store.query(`
            SELECT vote_count FROM ${table} 
            WHERE ${where} 
            ORDER BY ${duck.orderBy} 
            LIMIT 50
        `);
        const under50 = top50.filter(it => (Number(it.vote_count) || 0) < 50).length;
        const pct = top50.length ? Math.round((under50 / top50.length) * 100) : 0;
        return { pool, top50Count: top50.length, under50, pct };
    }

    for (const id of ids) {
        const p = presets.find(x => x.id === id);
        const current = await evaluate(id, {});
        console.log(`\n=== ${id} (${p.name}) ===`);
        console.log(`CURRENT (sort: ${p.queries[0].sort_by}, votes: ${p.queries[0]['vote_count.gte']}): pool=${current.pool}, under50=${current.under50}/${current.top50Count} (${current.pct}%)`);
        
        // Test raising vote_count.gte: 50
        const v50 = await evaluate(id, { 'vote_count.gte': 50 });
        console.log(`  vote_count.gte: 50 -> pool=${v50.pool}, under50=${v50.under50}/${v50.top50Count} (${v50.pct}%)`);

        // Test raising vote_count.gte: 30
        const v30 = await evaluate(id, { 'vote_count.gte': 30 });
        console.log(`  vote_count.gte: 30 -> pool=${v30.pool}, under50=${v30.under50}/${v30.top50Count} (${v30.pct}%)`);

        // If currently vote_average.desc, test popularity.desc
        if (p.queries[0].sort_by === 'vote_average.desc') {
            const pop = await evaluate(id, { sort_by: 'popularity.desc' });
            console.log(`  sort_by: popularity.desc (keep votes) -> pool=${pop.pool}, under50=${pop.under50}/${pop.top50Count} (${pop.pct}%)`);
        }
    }
}

testAllOptions().catch(console.error);
