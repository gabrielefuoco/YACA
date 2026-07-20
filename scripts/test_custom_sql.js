const duckDbStore = require('../src/db/duckDbStore');
const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
const { getPresets } = require('../src/data/presets');

async function test() {
    await duckDbStore.init();
    const presets = getPresets();

    const testPreset = async (presetId) => {
        const preset = presets.find(p => p.id === presetId);
        if (!preset) return console.log(`Preset ${presetId} not found`);
        console.log(`\n=== TEST: ${preset.name} ===`);
        const query = preset.queries[0];
        const res = await getDuckDbCatalogFromFilters(query, preset.type, 0, 5, {});
        res.forEach((m, i) => {
            console.log(`${i+1}. ${m.name} (ID: ${m._tmdbId})`);
        });
    };

    await testPreset('preset_hidden_gems');
    await testPreset('preset_indie_miracles');
    await testPreset('preset_boxoffice_bombs');

    duckDbStore.close();
}

test().catch(console.error);
