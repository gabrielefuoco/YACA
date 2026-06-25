const { catalogHandler } = require('../src/handlers/catalogHandler');

async function test() {
    try {
        const singleQueryFilters = {
            queries: [
                {
                    strategy: 'discovery',
                    with_genres: '28'
                }
            ],
            presentation_strategy: 'popularity'
        };

        const fullUserConfig = {
            profiles: [{ id: 'global', name: 'Global' }],
            activeProfileId: 'global',
            apiKeys: { tmdb: process.env.TMDB_API_KEY || 'fake_key' }
        };

        console.log('Testing catalogHandler for preview...');
        const previewData = await catalogHandler(
            {
                type: 'movie',
                id: null,
                filters: singleQueryFilters,
                extra: { skip: 0 }
            },
            fullUserConfig,
            'http://localhost'
        );
        console.log(`Result metas length: ${previewData?.metas?.length}`);
    } catch (e) {
        console.error('ERROR:', e);
    }
}
test();
