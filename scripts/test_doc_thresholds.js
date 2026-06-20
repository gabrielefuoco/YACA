require('dotenv').config();
const tmdb = require('../src/clients/tmdb');

async function testCount(tmdbClient, endpoint, params) {
    try {
        let total = 0;
        for (let page = 1; page <= 3; page++) {
            const res = await tmdbClient.get(endpoint, { params: { ...params, page }, timeout: 5000 });
            const pageResults = res.data?.results || [];
            total += pageResults.length;
            if (pageResults.length < 20) break;
        }
        return total;
    } catch (e) {
        return `Error: ${e.message}`;
    }
}

async function run() {
    const tmdbKey = process.env.TMDB_API_KEY;
    const tmdbClient = tmdb.createTmdbClient(tmdbKey);

    const nature_50 = await testCount(tmdbClient, '/discover/movie', {
        with_genres: 99,
        with_keywords: '18330|18165|9902|221355|284176',
        'vote_count.gte': 50
    });
    const nature_30 = await testCount(tmdbClient, '/discover/movie', {
        with_genres: 99,
        with_keywords: '18330|18165|9902|221355|284176',
        'vote_count.gte': 30
    });

    const space_50 = await testCount(tmdbClient, '/discover/movie', {
        with_genres: 99,
        with_keywords: '9882|3801|15325|41608|160330|252634',
        'vote_count.gte': 50
    });
    const space_10 = await testCount(tmdbClient, '/discover/movie', {
        with_genres: 99,
        with_keywords: '9882|3801|15325|41608|160330|252634',
        'vote_count.gte': 10
    });

    const history_50 = await testCount(tmdbClient, '/discover/tv', {
        with_genres: 99,
        with_keywords: '1956|2504|258077|221689|282633',
        'vote_count.gte': 50
    });
    const history_10 = await testCount(tmdbClient, '/discover/tv', {
        with_genres: 99,
        with_keywords: '1956|2504|258077|221689|282633',
        'vote_count.gte': 10
    });

    console.log(`Nature (vote_count >= 50): total count = ${nature_50}`);
    console.log(`Nature (vote_count >= 30): total count = ${nature_30}`);
    
    console.log(`Space (vote_count >= 50): total count = ${space_50}`);
    console.log(`Space (vote_count >= 10): total count = ${space_10}`);
    
    console.log(`History (vote_count >= 50): total count = ${history_50}`);
    console.log(`History (vote_count >= 10): total count = ${history_10}`);
}

run();
