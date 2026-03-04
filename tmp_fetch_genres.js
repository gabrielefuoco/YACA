const axios = require('axios');
const fs = require('fs');

async function run() {
    try {
        const tmdbKey = process.env.TMDB_API_KEY || 'ab1f5a5fe727c9b0e256fef3ec910cc9'; // assuming we have it in .env or provide a default for testing if available
        require('dotenv').config(); // Load .env
        const key = process.env.TMDB_API_KEY;
        if (!key) {
            console.log('No TMDB API key found');
            return;
        }

        console.log('Fetching movie genres...');
        const movieRes = await axios.get(`https://api.themoviedb.org/3/genre/movie/list?api_key=${key}&language=it`);
        console.log('Movie Genres:', movieRes.data.genres);

        console.log('Fetching tv genres...');
        const tvRes = await axios.get(`https://api.themoviedb.org/3/genre/tv/list?api_key=${key}&language=it`);
        console.log('TV Genres:', tvRes.data.genres);

    } catch (e) {
        console.error(e.response ? e.response.data : e.message);
    }
}
run();
