const indice = require('../src/indice');
const { catalogHandler } = require('../src/stremio/catalogHandler');

async function main() {
    await indice.init();

    const kidsConfig = {
        userId: 'test_user_kids',
        addonUuid: 'test-uuid-kids',
        activeProfileId: 'prof_kids',
        profiles: [
            {
                id: 'prof_kids',
                name: 'Bambini',
                settings: {
                    kidsMode: true,
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
        kidsConfig,
        'http://localhost:7000'
    );

    const metas = res?.metas || [];
    console.log(`PRESET_POP_MOVIES (kidsMode: true) count: ${metas.length}`);
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
