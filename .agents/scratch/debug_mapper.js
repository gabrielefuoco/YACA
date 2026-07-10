require('dotenv').config();
const connectDB = require('../../src/db/connection');
const mongoose = require('mongoose');

const { translateAnimeIdsToKitsu } = require('../../src/utils/TmdbToKitsuMapper');
const tmdbApiKey = process.env.TMDB_API_KEY;

const mockResults = [
    {
        id: 'tmdb:14606', // TMDB: Attack on Titan (Tutte le stagioni)
        type: 'series',
        name: 'Attack on Titan (TMDB)',
        genre_ids: [16],
        origin_country: ['JP'],
        original_language: 'ja'
    }
];

async function runTest() {
    await connectDB();
    console.log("Mock items:", mockResults);
    const mapped = await translateAnimeIdsToKitsu(mockResults, tmdbApiKey);
    console.log("Mapped items:", mapped);
    
    await mongoose.disconnect();
    process.exit(0);
}

runTest();
