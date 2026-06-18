require('dotenv').config();
const tmdb = require('./src/clients/tmdb');

async function run() {
    const tmdbKey = process.env.TMDB_API_KEY;
    const tmdbClient = tmdb.createTmdbClient(tmdbKey);

    try {
        const queries = ['slapstick', 'parody', 'spoof', 'screwball comedy'];
        for (const query of queries) {
            const res = await tmdbClient.get('/search/keyword', {
                params: { query, page: 1 }
            });
            console.log(`=== Keywords for "${query}" ===`);
            (res.data.results || []).slice(0, 5).forEach(k => console.log(`- ${k.name}: ID = ${k.id}`));
            console.log();
        }
    } catch (e) {
        console.error(e.message);
    }
}

run();
