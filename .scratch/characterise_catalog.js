const indice = require('../src/indice');
const { catalogHandler } = require('../src/stremio/catalogHandler');

async function main() {
    await indice.init();

    const standardConfig = {
        userId: 'test_user_std',
        addonUuid: 'test-uuid-std',
        activeProfileId: 'prof_std',
        profiles: [
            {
                id: 'prof_std',
                name: 'Standard',
                settings: {
                    kidsMode: false,
                    typeSelectors: { film: false, serie: false, anime: null }
                }
            }
        ],
        apiKeys: {
            tmdb: 'dummy_key'
        }
    };

    const res = await catalogHandler(
        { id: 'preset_pop_movies', type: 'movie', extra: { skip: 0 } },
        standardConfig,
        'http://localhost:7000'
    );

    const metas = res?.metas || [];
    console.log(`PRESET_POP_MOVIES count: ${metas.length}`);
    const summary = metas.map(m => ({ id: m.id, name: m.name }));
    const fs = require('fs');
    fs.writeFileSync('.scratch/preset_pop_movies_before.json', JSON.stringify(summary, null, 2));
    console.log('Saved .scratch/preset_pop_movies_before.json');
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
