require('dotenv').config();
const { translateAnimeIdsToKitsu } = require('./src/utils/TmdbToKitsuMapper');

async function testMapper() {
    console.log("Testing TmdbToKitsuMapper...");

    // 37854: One Piece (Anime)
    // 60554: Star Wars Rebels (Animation, ma non JP)
    // 1396: Breaking Bad (Non animation)

    const mockResults = [
        { id: 'tmdb:37854', name: 'One Piece', genre_ids: [16, 10759], origin_country: ['JP'] },
        { id: 'tmdb:60554', name: 'Star Wars Rebels', genre_ids: [16], origin_country: ['US'] },
        { id: 'tmdb:1396', name: 'Breaking Bad', genre_ids: [18], origin_country: ['US'] }
    ];

    const translated = await translateAnimeIdsToKitsu(mockResults);
    console.log("Translated Results:");
    console.log(JSON.stringify(translated, null, 2));
}

testMapper();
