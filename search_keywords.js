const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

async function searchKeywords(query) {
    try {
        const response = await axios.get(`${BASE_URL}/search/keyword`, {
            params: {
                api_key: API_KEY,
                query: query,
                page: 1
            }
        });
        console.log(`\n--- Results for "${query}" ---`);
        response.data.results.slice(0, 10).forEach(kw => {
            console.log(`${kw.id}: ${kw.name}`);
        });
    } catch (error) {
        console.error(error.message);
    }
}

async function run() {
    const queries = [
        'star wars', 'harry potter', 'marvel', 'dc comics', 'james bond', 'jurassic park', 'lord of the rings',
        'medical drama', 'hospital', 'doctor', 'legal drama', 'lawyer', 'courtroom',
        'video game', 'based on video game', 'sitcom', 'friends', 'manga', 'manhwa', 'webtoon'
    ];
    for (const q of queries) {
        await searchKeywords(q);
    }
}

run();
