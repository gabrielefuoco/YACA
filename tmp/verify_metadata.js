const { getTmdbMetaDetails } = require('../src/clients/tmdb');
require('dotenv').config();

async function verify() {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        console.error("ERRORE: TMDB_API_KEY mancante nel .env");
        return;
    }

    console.log("--- TEST FILM: Interstellar ---");
    const movieMeta = await getTmdbMetaDetails(apiKey, 'tmdb:157336', 'movie', {
        imdb: 8.7,
        rtCritic: 74,
        rtAudience: 86,
        metacritic: 74
    });

    if (movieMeta) {
        console.log("Titolo:", movieMeta.name);
        console.log("IMDb Rating:", movieMeta.imdbRating);
        console.log("Descrizione:\n", movieMeta.description);
        console.log("Links (primi 5):", JSON.stringify(movieMeta.links.slice(0, 5), null, 2));
    }

    console.log("\n--- TEST SERIE: The Boys ---");
    const seriesMeta = await getTmdbMetaDetails(apiKey, 'tmdb:76479', 'series');
    if (seriesMeta) {
        console.log("Titolo:", seriesMeta.name);
        console.log("Descrizione (inizio):\n", seriesMeta.description.substring(0, 500) + "...");
        console.log("Stato:", seriesMeta.releaseInfo);
    }
}

verify().catch(console.error);
