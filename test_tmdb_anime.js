require('dotenv').config();
const { createTmdbClient } = require('./src/clients/tmdb');
const tmdbClient = createTmdbClient(process.env.TMDB_API_KEY);

async function testTmdbAnime() {
    try {
        const res = await tmdbClient.get('/discover/tv', {
            params: {
                with_original_language: 'ja',
                with_genres: '16',
                sort_by: 'popularity.desc',
                page: 1
            }
        });
        
        console.log("TMDB TV Anime (ja + 16):");
        res.data.results.slice(0, 10).forEach(r => console.log(`- ${r.name}`));

        const res2 = await tmdbClient.get('/discover/movie', {
            params: {
                with_original_language: 'ja',
                with_genres: '16',
                sort_by: 'popularity.desc',
                page: 1
            }
        });
        console.log("\nTMDB Movie Anime (ja + 16):");
        res2.data.results.slice(0, 10).forEach(r => console.log(`- ${r.title}`));

    } catch(e) {
        console.error(e.message);
    }
}
testTmdbAnime();
