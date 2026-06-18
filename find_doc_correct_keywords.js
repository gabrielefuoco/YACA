require('dotenv').config();
const tmdb = require('./src/clients/tmdb');

async function run() {
    const tmdbKey = process.env.TMDB_API_KEY;
    const tmdbClient = tmdb.createTmdbClient(tmdbKey);

    const search = async (query) => {
        try {
            const res = await tmdbClient.get('/search/keyword', {
                params: { query, page: 1 }
            });
            console.log(`=== Keywords for "${query}" ===`);
            (res.data.results || []).slice(0, 8).forEach(k => console.log(`- ${k.name}: ID = ${k.id}`));
            console.log();
        } catch (e) {
            console.error(e.message);
        }
    };

    await search("nature");
    await search("animals");
    await search("wildlife");
    await search("environment");
    
    await search("outer space");
    await search("astronomy");
    await search("universe");
    await search("cosmology");

    await search("world war");
    await search("military history");
}

run();
