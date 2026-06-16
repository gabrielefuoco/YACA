const axios = require('axios');
require('dotenv').config();

async function test() {
    const key = process.env.TMDB_API_KEY;
    const url = 'https://api.tmdb.org/3/discover/tv';
    
    // Test 1: Only language=it-IT
    const res1 = await axios.get(url, {
        params: {
            api_key: key,
            with_keywords: '210024',
            sort_by: 'popularity.desc',
            language: 'it-IT'
        }
    });
    console.log("TEST 1 - language=it-IT");
    console.log(res1.data.results.slice(0, 2).map(r => ({ name: r.name, poster: r.poster_path })));

    // Test 2: language=it-IT, include_image_language=it,en,null
    const res2 = await axios.get(url, {
        params: {
            api_key: key,
            with_keywords: '210024',
            sort_by: 'popularity.desc',
            language: 'it-IT',
            include_image_language: 'it,en,null'
        }
    });
    console.log("TEST 2 - with include_image_language");
    console.log(res2.data.results.slice(0, 2).map(r => ({ name: r.name, poster: r.poster_path })));

}

test().catch(console.error);
