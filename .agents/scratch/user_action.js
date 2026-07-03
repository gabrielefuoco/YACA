require('dotenv').config();
const mongoose = require('mongoose');
const { fetchTraktCatalog } = require('../../src/clients/trakt'); // Just in case, though we need stremio liked/loved
const { stremioLikesClient } = require('../../src/clients/stremio');
const { pushToStremioLibrary, fetchStremioLibrary } = require('../../src/utils/stremioAddon');
const UserAccount = require('../../src/db/models/UserAccount');
const { createTmdbClient } = require('../../src/clients/tmdb');

const TMDB_KEY = process.env.TMDB_API_KEY;
const tmdbClient = createTmdbClient(TMDB_KEY);

async function fetchStremioCatalog(addonKey, type, catalogId) {
    try {
        const url = `https://likes.stremio.com/addons/${catalogId.includes('liked') ? 'liked' : 'loved'}/movies-shows/user=${addonKey}/catalog/${type}/${catalogId}.json`;
        const res = await stremioLikesClient.get(url, { timeout: 10000 });
        return res.data?.metas || [];
    } catch (err) {
        console.warn(`[StremioSync] Failed to fetch catalog ${catalogId}:`, err.message);
        return [];
    }
}

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        
        // Prendiamo il primo utente disponibile
        const targetUser = await UserAccount.findOne({});
        
        if (!targetUser) {
            console.error("No user found in DB.");
            process.exit(1);
        }
        
        const authKey = targetUser.apiKeys?.stremio;
        if (!authKey) {
            console.error("User does not have a Stremio authKey configured.");
            process.exit(1);
        }

        console.log(`Found Stremio AuthKey for user ${targetUser.email || targetUser.userId}`);
        
        // 1. Fetch Addon Key for Liked/Loved
        const addonKeyRes = await stremioLikesClient.get(`/getAddonKey?key=${authKey}`);
        const addonKey = addonKeyRes.data?.key || addonKeyRes.data;
        
        // 2. Read Liked/Loved
        const [likedMovies, likedSeries, lovedMovies, lovedSeries] = await Promise.all([
            fetchStremioCatalog(addonKey, 'movie', 'stremio-liked-movie'),
            fetchStremioCatalog(addonKey, 'series', 'stremio-liked-series'),
            fetchStremioCatalog(addonKey, 'movie', 'stremio-loved-movie'),
            fetchStremioCatalog(addonKey, 'series', 'stremio-loved-series'),
        ]);

        const liked = [...likedMovies, ...likedSeries];
        const loved = [...lovedMovies, ...lovedSeries];
        
        console.log('\n--- LIKED ITEMS ---');
        liked.forEach(item => console.log(`- ${item.name || item.id} (${item.type})`));
        if (liked.length === 0) console.log("Nessun elemento Liked trovato.");
        
        console.log('\n--- LOVED ITEMS ---');
        loved.forEach(item => console.log(`- ${item.name || item.id} (${item.type})`));
        if (loved.length === 0) console.log("Nessun elemento Loved trovato.");

        // 3. Search and Add "Cado dalle nubi"
        console.log('\n--- ADDING "Cado dalle nubi" TO LIBRARY ---');
        // Usiamo TMDB per cercare il film
        const searchRes = await tmdbClient.get('/search/movie', {
            params: { query: 'Cado dalle nubi', language: 'it-IT' }
        });
        
        if (searchRes.data.results && searchRes.data.results.length > 0) {
            const tmdbItem = searchRes.data.results[0];
            console.log(`Trovato su TMDB: ${tmdbItem.title} (${tmdbItem.id})`);
            
            // Per Stremio Library, è meglio avere l'IMDB ID
            const detailRes = await tmdbClient.get(`/movie/${tmdbItem.id}`);
            const imdbId = detailRes.data.imdb_id;
            
            if (imdbId) {
                console.log(`IMDB ID trovato: ${imdbId}`);
                
                const metaToAdd = {
                    id: imdbId,
                    type: 'movie',
                    name: tmdbItem.title,
                    poster: `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}`,
                    posterShape: 'poster',
                    background: `https://image.tmdb.org/t/p/original${tmdbItem.backdrop_path}`,
                    releaseInfo: tmdbItem.release_date ? tmdbItem.release_date.split('-')[0] : ''
                };
                
                const result = await pushToStremioLibrary(authKey, [metaToAdd]);
                console.log("Risultato Scrittura Libreria:", result);
            } else {
                console.error("IMDB ID non trovato per il film.");
            }
        } else {
            console.error("Film 'Cado dalle nubi' non trovato su TMDB.");
        }

    } catch (err) {
        console.error("Errore generale:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
