require('dotenv').config();
const mongoose = require('mongoose');
const { catalogHandler } = require('../src/handlers/catalogHandler');
const { getPresets } = require('../src/data/presets');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);

    const presets = getPresets().filter(p => p.id.startsWith('preset_anime_') && p.id !== 'preset_anime_simulcast');
    
    for (const preset of presets) {
        console.log(`\nTesting ${preset.id}...`);
        
        const singleQueryFilters = {
            queries: preset.queries,
            presentation_strategy: preset.presentation_strategy || 'popularity'
        };

        const fullUserConfig = { apiKeys: { tmdb: process.env.TMDB_API_KEY } };

        try {
            const previewData = await catalogHandler(
                {
                    type: preset.type === 'movie' ? 'movie' : 'series',
                    id: null,
                    filters: singleQueryFilters,
                    extra: { skip: 0 }
                },
                fullUserConfig,
                'http://localhost:7860'
            );

            console.log(`=> ${preset.id} returned ${previewData?.metas?.length || 0} items.`);
            if (previewData?.metas?.length > 0) {
                console.log(`   Sample: ${previewData.metas[0].id} - ${previewData.metas[0].name}`);
            }
        } catch (e) {
            console.error(`=> Error on ${preset.id}:`, e.message);
        }
    }
    
    await mongoose.disconnect();
}
test().catch(console.error);
