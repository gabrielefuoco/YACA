require('dotenv').config();
const { catalogHandler } = require('../src/handlers/catalogHandler');

async function test() {
    const singleQueryFilters = {
        queries: [
            {
                strategy: 'discovery',
                provider: 'kitsu',
                _keywordNames: 'shounen',
                sort_by: 'popularity.desc'
            }
        ],
        presentation_strategy: 'popularity'
    };

    const fullUserConfig = { apiKeys: { tmdb: process.env.TMDB_API_KEY } };

    const previewData = await catalogHandler(
        {
            type: 'series',
            id: null,
            filters: singleQueryFilters,
            extra: { skip: 0 }
        },
        fullUserConfig,
        'http://localhost:7860'
    );

    console.log("previewData metas length:", previewData?.metas?.length);
    if (previewData?.metas?.length > 0) {
        const item = previewData.metas[0];
        console.log("First item:", { id: item.id, name: item.name, poster: item.poster });
    }
}
test().catch(console.error);
