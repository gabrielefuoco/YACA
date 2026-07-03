const { getTmdbMetaDetails, fetchTmdbEpisodes, createTmdbClient } = require('./src/clients/tmdb');
const { getKitsuMetaDetails } = require('./src/clients/kitsu');
const userConfig = { apiKeys: { tmdb: process.env.TMDB_API_KEY || '6d12ceca4c46f366113c015b6d76bb92' } };

async function test() {
    const tmdbId = '1399'; // Game of Thrones
    const client = createTmdbClient(userConfig.apiKeys.tmdb);
    
    console.log("Fetching meta details for Game of Thrones (1399)...");
    const meta = await getTmdbMetaDetails(userConfig.apiKeys.tmdb, '1399', 'series');
    console.log("Meta generated.");
    console.log(`Episodes count: ${meta?.videos?.length || 0}`);
    
    if (meta?.videos?.length > 0) {
        console.log("First episode:", meta.videos[0]);
    } else {
        console.log("Videos array is empty or undefined!");
    }
}

test().catch(console.error);
