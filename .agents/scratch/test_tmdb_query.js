require('dotenv').config();
const tmdb = require('../../src/clients/tmdb');

async function test() {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return;
    const client = tmdb.createTmdbClient(tmdbKey);

    // Test with correct keywords
    try {
        const res = await client.get('/discover/tv', {
            params: {
                with_genres: '16,35',
                with_keywords: '161919|315444',
                without_keywords: '210024'
            }
        });
        console.log("Adult Animation (with 161919|315444) count:", res.data?.total_results);
    } catch (e) {
        console.error(e.message);
    }

    // Prova senza specificare with_genres (perché le keywords "adult animation" sono già specifiche per l'animazione)
    try {
        const res = await client.get('/discover/tv', {
            params: {
                with_keywords: '161919|315444',
                without_keywords: '210024'
            }
        });
        console.log("Adult Animation without genres count:", res.data?.total_results);
    } catch (e) {
        console.error(e.message);
    }

    // Prova solo genere Animation (16) + Comedy (35) ma senza keyword restrittive, usando magari "vote_count.gte: 100" e rating "TV-MA" o simile
    try {
        const res = await client.get('/discover/tv', {
            params: {
                with_genres: '16,35',
                without_keywords: '210024',
                'vote_count.gte': 50
            }
        });
        console.log("Animation + Comedy (no anime, votes>=50) count:", res.data?.total_results);
    } catch (e) {
        console.error(e.message);
    }
}

test();
