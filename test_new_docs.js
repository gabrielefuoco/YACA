require('dotenv').config();
const tmdb = require('./src/clients/tmdb');

async function test(tmdbClient, endpoint, label, params) {
    try {
        const res = await tmdbClient.get(endpoint, { params, timeout: 5000 });
        console.log(`- ${label}: returned ${res.data?.results?.length || 0} results.`);
        (res.data?.results || []).slice(0, 5).forEach((r, idx) => {
            console.log(`    ${idx + 1}. "${r.title || r.name}" (ID: ${r.id}, Pop: ${r.popularity}, Votes: ${r.vote_count})`);
        });
    } catch (e) {
        console.error(e.message);
    }
}

async function run() {
    const tmdbKey = process.env.TMDB_API_KEY;
    const tmdbClient = tmdb.createTmdbClient(tmdbKey);

    console.log("=== Testing Nature Docs (Movie) ===");
    await test(tmdbClient, '/discover/movie', 'Nature (vote >= 200)', {
        with_genres: 99,
        with_keywords: '18330|18165|9902|221355|284176',
        sort_by: 'vote_average.desc',
        'vote_count.gte': 200
    });
    await test(tmdbClient, '/discover/movie', 'Nature (vote >= 50)', {
        with_genres: 99,
        with_keywords: '18330|18165|9902|221355|284176',
        sort_by: 'vote_average.desc',
        'vote_count.gte': 50
    });

    console.log("\n=== Testing Space Docs (Movie) ===");
    await test(tmdbClient, '/discover/movie', 'Space (vote >= 200)', {
        with_genres: 99,
        with_keywords: '9882|3801|15325|41608|160330|252634',
        sort_by: 'vote_average.desc',
        'vote_count.gte': 200
    });
    await test(tmdbClient, '/discover/movie', 'Space (vote >= 50)', {
        with_genres: 99,
        with_keywords: '9882|3801|15325|41608|160330|252634',
        sort_by: 'vote_average.desc',
        'vote_count.gte': 50
    });

    console.log("\n=== Testing History/War Docs (TV Series) ===");
    await test(tmdbClient, '/discover/tv', 'History/War (vote >= 100)', {
        with_genres: 99,
        with_keywords: '1956|2504|258077|221689|282633',
        sort_by: 'vote_average.desc',
        'vote_count.gte': 100
    });
    await test(tmdbClient, '/discover/tv', 'History/War (vote >= 10)', {
        with_genres: 99,
        with_keywords: '1956|2504|258077|221689|282633',
        sort_by: 'vote_average.desc',
        'vote_count.gte': 10
    });
}

run();
