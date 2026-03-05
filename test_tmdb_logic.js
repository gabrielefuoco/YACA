const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

async function testDiscover(params) {
    try {
        const response = await axios.get(`${BASE_URL}/discover/movie`, {
            params: {
                api_key: API_KEY,
                ...params
            }
        });
        return response.data.total_results;
    } catch (error) {
        console.error(error.message);
        return null;
    }
}

async function runTest() {
    console.log('Testing TMDB Logic...');

    // Genre 28 (Action), 12 (Adventure)
    const action = await testDiscover({ with_genres: '28' });
    const adventure = await testDiscover({ with_genres: '12' });
    const comma = await testDiscover({ with_genres: '28,12' });
    const pipe = await testDiscover({ with_genres: '28|12' });

    console.log(`Action: ${action}`);
    console.log(`Adventure: ${adventure}`);
    console.log(`Comma (28,12): ${comma}`);
    console.log(`Pipe (28|12): ${pipe}`);

    if (comma > action && comma > adventure) {
        console.log('RESULT: Comma (,) is OR');
    } else if (comma < action && comma < adventure) {
        console.log('RESULT: Comma (,) is AND');
    }

    if (pipe > action && pipe > adventure) {
        console.log('RESULT: Pipe (|) is OR');
    } else if (pipe < action && pipe < adventure) {
        console.log('RESULT: Pipe (|) is AND');
    }
}

runTest();
