require('dotenv').config();
const { createTmdbClient } = require('./src/clients/tmdb');
async function test() {
    const tmdbKey = process.env.TMDB_API_KEY;
    const tmdbClient = createTmdbClient(tmdbKey);
    const k = { id: '210024', name: 'keyword 210024' };
    const res = await tmdbClient.get(`/keyword/${k.id}`);
    console.log("Keyword:", res.data);
}
test().catch(console.error);
