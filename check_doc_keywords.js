require('dotenv').config();
const tmdb = require('./src/clients/tmdb');

async function run() {
    const tmdbKey = process.env.TMDB_API_KEY;
    const tmdbClient = tmdb.createTmdbClient(tmdbKey);

    const check = async (label, ids) => {
        console.log(`=== ${label} ===`);
        for (const id of ids) {
            try {
                const res = await tmdbClient.get(`/keyword/${id}`);
                console.log(`ID ${id} = "${res.data.name}"`);
            } catch (e) {
                console.log(`ID ${id} = Failed to fetch (${e.message})`);
            }
        }
    };

    await check("Nature Keywords", [818, 2964, 2271, 9882]);
    await check("Space Keywords", [3801, 161176, 173161, 3388]);
    await check("History/War Keywords", [273967, 282633, 195232, 3573]);
}

run();
