require('dotenv').config();
const connectDB = require('../../src/db/connection');
const mongoose = require('mongoose');

const { translateAnimeIdsToKitsu, translateAnimeIdsToImdb } = require('../../src/utils/TmdbToKitsuMapper');
const tmdbApiKey = process.env.TMDB_API_KEY;

const mockResults = [
    // 1. ANIME (TMDB)
    {
        id: 'tmdb:14606', // TMDB: Attack on Titan
        type: 'series',
        name: 'Attack on Titan (TMDB)',
        genre_ids: [16],
        origin_country: ['JP'],
        original_language: 'ja'
    },
    // 2. ANIME (KITSU)
    {
        id: 'kitsu:7442', // Kitsu: Attack on Titan (Season 1)
        type: 'series',
        name: 'Attack on Titan Season 1 (Kitsu)'
    },
    // 3. ANIME (KITSU - S2)
    {
        id: 'kitsu:8671', // Kitsu: Attack on Titan (Season 2)
        type: 'series',
        name: 'Attack on Titan Season 2 (Kitsu)'
    },
    // 4. MOVIE (LIVE ACTION - TMDB)
    {
        id: 'tmdb:603', // TMDB: The Matrix
        type: 'movie',
        name: 'The Matrix (TMDB)',
        genre_ids: [28, 878], // Azione, Fantascienza
        origin_country: ['US'],
        original_language: 'en'
    },
    // 5. SERIES (WESTERN - TMDB)
    {
        id: 'tmdb:1396', // TMDB: Breaking Bad
        type: 'series',
        name: 'Breaking Bad (TMDB)',
        genre_ids: [18, 80], // Dramma, Crime
        origin_country: ['US'],
        original_language: 'en'
    }
];

async function runTest() {
    await connectDB();
    
    console.log("\n=== RISULTATI MISTI DALL'AI ===");
    mockResults.forEach(r => console.log(`- [${r.id}] ${r.name} (Type: ${r.type}, Lang: ${r.original_language || 'N/A'})`));
    console.log("\n===================================\n");

    console.log("TEST 1: animeIdMode = 'kitsu'");
    console.log("Aspettativa: I Live Action restano TMDB. L'Anime TMDB diventa Kitsu e deduplicato.");
    let resultsKitsuMode = JSON.parse(JSON.stringify(mockResults));
    resultsKitsuMode = await translateAnimeIdsToKitsu(resultsKitsuMode, tmdbApiKey);
    
    const seenIdsKitsu = new Set();
    resultsKitsuMode = resultsKitsuMode.filter(item => {
        const itemId = String(item.id || '');
        if (seenIdsKitsu.has(itemId)) return false;
        seenIdsKitsu.add(itemId);
        return true;
    });
    resultsKitsuMode.forEach(r => console.log(`-> [${r.id}] ${r.name}`));
    console.log("\n-----------------------------------\n");

    console.log("TEST 2: animeIdMode = 'imdb'");
    console.log("Aspettativa: I Live Action restano TMDB. Gli Anime collassano in IMDb.");
    let resultsImdbMode = JSON.parse(JSON.stringify(mockResults));
    
    resultsImdbMode = await translateAnimeIdsToKitsu(resultsImdbMode, tmdbApiKey);
    resultsImdbMode = await translateAnimeIdsToImdb(resultsImdbMode, tmdbApiKey);
    
    const seenIdsImdb = new Set();
    resultsImdbMode = resultsImdbMode.filter(item => {
        const itemId = String(item.id || '');
        if (seenIdsImdb.has(itemId)) return false;
        seenIdsImdb.add(itemId);
        return true;
    });

    resultsImdbMode.forEach(r => console.log(`-> [${r.id}] ${r.name}`));
    console.log("\n===================================");
    
    await mongoose.disconnect();
    process.exit(0);
}

runTest();
