require('dotenv').config();
const tmdb = require('../../src/clients/tmdb');

async function test() {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return;
    const client = tmdb.createTmdbClient(tmdbKey);

    try {
        const res = await client.get('/discover/tv', {
            params: {
                with_genres: '10765', // Sci-Fi & Fantasy
                with_keywords: '12190|156556|210086|803|679|310|4563|9685',
                sort_by: 'popularity.desc',
                'vote_count.gte': 5
            }
        });
        console.log("preset_cyberpunk_series (new keywords) count:", res.data?.total_results);
    } catch (e) {
        console.error(e.message);
    }
}

test();
