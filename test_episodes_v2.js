require('dotenv').config();
const mongoose = require('mongoose');
const { getTmdbMetaDetails, fetchTmdbEpisodes, createTmdbClient } = require('./src/clients/tmdb');

const connectDB = require('./src/db/connection');

async function test() {
    await connectDB();
    
    // Test with Mushoku Tensei
    const tmdbId = '95479';
    const tmdbApiKey = process.env.TMDB_API_KEY;
    
    console.log(`Using API KEY: ${tmdbApiKey ? tmdbApiKey.substring(0, 5) + '...' : 'Missing!'}`);
    
    console.log("Fetching meta details for Mushoku Tensei (95479)...");
    const meta = await getTmdbMetaDetails(tmdbApiKey, tmdbId, 'series');
    console.log("Meta generated.");
    console.log(`Episodes count: ${meta?.videos?.length || 0}`);
    
    if (meta?.videos?.length > 0) {
        console.log("First episode ID:", meta.videos[0].id);
        console.log("Last episode ID:", meta.videos[meta.videos.length - 1].id);
    } else {
        console.log("Videos array is empty or undefined!");
    }
    
    await mongoose.disconnect();
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
