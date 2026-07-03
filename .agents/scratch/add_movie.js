require('dotenv').config();
const mongoose = require('mongoose');
const { pushToStremioLibrary } = require('../../src/utils/stremioAddon');
const UserAccount = require('../../src/db/models/UserAccount');
const AddonConfig = require('../../src/db/models/AddonConfig');
const { createTmdbClient } = require('../../src/clients/tmdb');

const TMDB_KEY = process.env.TMDB_API_KEY;
const tmdbClient = createTmdbClient(TMDB_KEY);

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        
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

        console.log(`Found Stremio AuthKey for user ${targetUser.email}`);
        
        // Fetch user config for ERDB processing
        let userConfig = null;
        if (targetUser.addonUuid) {
            userConfig = await AddonConfig.findOne({ uuid: targetUser.addonUuid }).lean();
        }

        console.log('\n--- ADDING "Chiedimi se sono felice" TO LIBRARY ---');
        const searchRes = await tmdbClient.get('/search/movie', {
            params: { query: 'Chiedimi se sono felice', language: 'it-IT' }
        });
        
        if (searchRes.data.results && searchRes.data.results.length > 0) {
            const tmdbItem = searchRes.data.results[0];
            console.log(`Trovato su TMDB: ${tmdbItem.title} (${tmdbItem.id})`);
            
            const detailRes = await tmdbClient.get(`/movie/${tmdbItem.id}`);
            const imdbId = detailRes.data.imdb_id;
            
            if (imdbId) {
                console.log(`IMDB ID trovato: ${imdbId}`);
                
                const metaToAdd = {
                    id: imdbId,
                    tmdbId: tmdbItem.id, // Important for ERDB mapping if IMDB is used as primary ID
                    type: 'movie',
                    name: tmdbItem.title,
                    poster: `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}`,
                    posterShape: 'poster',
                    background: `https://image.tmdb.org/t/p/original${tmdbItem.backdrop_path}`,
                    releaseInfo: tmdbItem.release_date ? tmdbItem.release_date.split('-')[0] : '',
                    _itaBadge: true // Force ITA badge to see if it works
                };
                
                const sanitizeOptions = {
                    userConfig: userConfig,
                    hostUrl: process.env.HOST_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:7000',
                    shouldApplyEpisodeBadge: false
                };

                console.log("Pushing to Stremio with sanitizeOptions...");
                const result = await pushToStremioLibrary(authKey, [metaToAdd], sanitizeOptions);
                console.log("Risultato Scrittura Libreria:", result);
            } else {
                console.error("IMDB ID non trovato per il film.");
            }
        } else {
            console.error("Film non trovato su TMDB.");
        }

    } catch (err) {
        console.error("Errore generale:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
