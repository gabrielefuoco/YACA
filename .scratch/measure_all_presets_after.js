const indice = require('../src/indice');
const { catalogHandler } = require('../src/stremio/catalogHandler');
const { getPresets } = require('../src/catalog/presets');
const fs = require('fs');

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

    const presets = getPresets();

    let shortCount = 0;
    let emptyCount = 0;
    let fullCount = 0;
    const shortList = [];
    const emptyList = [];

    for (const p of presets) {
        try {
            const res = await catalogHandler(
                { id: p.id, type: p.type || 'movie', extra: { skip: 0 } },
                kidsConfig,
                'http://localhost:7000'
            );
            const count = res?.metas?.length || 0;
            if (count === 0) {
                emptyCount++;
                emptyList.push(p.id);
            } else if (count < 20) {
                shortCount++;
                shortList.push({ id: p.id, count });
            } else {
                fullCount++;
            }
        } catch (e) {}
    }

    console.log(`Results AFTER:`);
    console.log(`Total presets tested: ${presets.length}`);
    console.log(`Full (>= 20): ${fullCount}`);
    console.log(`Short (< 20): ${shortCount}`);
    console.log(`Empty (0): ${emptyCount}`);

    fs.writeFileSync('.scratch/measure_presets_after.json', JSON.stringify({
        total: presets.length,
        fullCount,
        shortCount,
        emptyCount,
        shortList,
        emptyList
    }, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
