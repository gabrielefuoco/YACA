const { catalogHandler } = require('../src/handlers/catalogHandler');
const tmdb = require('../src/clients/tmdb');
const { getPresets } = require('../src/data/presets');

async function test() {
    try {
        const args = {
            id: 'yaca_discover_movies',
            type: 'movie',
            extra: { skip: 0 }
        };
        const userConfig = {
            profiles: [{ id: 'global', name: 'Global' }],
            activeProfileId: 'global',
            apiKeys: { tmdb: process.env.TMDB_API_KEY || 'fake_key' }
        };
        const hostUrl = 'http://localhost';
        
        console.log('Testing getCatalog...');
        const result = await catalogHandler(args, userConfig, hostUrl);
        console.log(`Result length: ${result?.metas?.length}`);
    } catch (e) {
        console.error('ERROR in getCatalog:', e);
    }
}
test();
