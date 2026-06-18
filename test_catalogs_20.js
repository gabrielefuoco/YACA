require('dotenv').config();
const mongoose = require('mongoose');
const { 
    buildDirectPresetCatalog,
    buildTopGenresMixCatalog,
    buildHybridCatalog,
    buildHiddenGemsCatalog,
    buildTraktFilteredCatalog 
} = require('./src/engines/hybrid/catalogStrategies');
const tmdb = require('./src/clients/tmdb');
const UserAccount = require('./src/db/models/UserAccount');
const AddonConfig = require('./src/db/models/AddonConfig');
const fs = require('fs');
const path = require('path');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB.");

        const users = await UserAccount.find().lean();
        const configs = await AddonConfig.find().lean();
        
        if (users.length === 0 || configs.length === 0) {
            console.error("No users or configurations found in database.");
            return;
        }

        const user = users[0];
        const userId = user.userId;
        const tmdbKey = user.apiKeys?.tmdb || process.env.TMDB_API_KEY;
        const traktToken = user.apiKeys?.trakt || user.apiKeys?.traktToken;
        const context = 'global';

        console.log(`Using user: ${userId}`);
        console.log(`TMDB Key: ${tmdbKey ? 'Present' : 'Missing'}`);
        console.log(`Trakt Token: ${traktToken ? 'Present' : 'Missing'}`);

        // Mock profile input for Otaku Hardcore preset if needed (similar to verify_catalog.js)
        const { processProfiles } = require('./src/api/configure/profileProcessor');
        const mockInputProfiles = [{
            id: 'global',
            selectedPresets: ['preset_pop_anime', 'preset_new_anime', 'preset_anime_classics']
        }];
        
        const warnings = [];
        const processedProfiles = await processProfiles(mockInputProfiles, userId, null, warnings);
        
        await AddonConfig.updateOne(
            { uuid: configs[0].uuid },
            { $set: { "profiles.0.settings": processedProfiles[0].settings, "profiles.0.catalogs": processedProfiles[0].catalogs } }
        );

        const tmdbClient = tmdb.createTmdbClient(tmdbKey);
        const results = {};

        const fetchDetails = async (id, mediaType = 'movie') => {
            try {
                const res = await tmdbClient.get(`/${mediaType}/${id}`, { params: { language: 'it-IT' } });
                return {
                    id: String(id),
                    title: res.data.title || res.data.name,
                    release_date: res.data.release_date || res.data.first_air_date,
                    vote_average: res.data.vote_average,
                    popularity: res.data.popularity,
                    genres: (res.data.genres || []).map(g => g.name),
                    overview: res.data.overview
                };
            } catch (e) {
                return { id: String(id), error: `Failed to fetch details: ${e.message}` };
            }
        };

        const testCatalog = async (name, strategyFn) => {
            console.log(`\nTesting strategy: ${name}...`);
            const ids = await strategyFn();
            console.log(`Strategy ${name} returned ${ids.length} items.`);
            const top20Ids = ids.slice(0, 20);
            
            const items = [];
            for (const id of top20Ids) {
                const details = await fetchDetails(id, 'movie');
                items.push(details);
            }
            results[name] = items;
        };

        // 1. Direct Preset Catalog
        await testCatalog("Direct Preset Catalog (Film Popolari)", () => 
            buildDirectPresetCatalog('preset_pop_movies', userId, context, tmdbKey, 'movie')
        );

        // 2. Top Genres Mix
        await testCatalog("Top Genres Mix", () => 
            buildTopGenresMixCatalog(userId, context, tmdbKey, 'movie')
        );

        // 3. Hybrid Catalog (Rete Preferiti)
        await testCatalog("Hybrid Catalog (Rete Preferiti)", () => 
            buildHybridCatalog(userId, context, traktToken, tmdbKey, 'movie')
        );

        // 4. Hidden Gems
        await testCatalog("Hidden Gems", () => 
            buildHiddenGemsCatalog(userId, context, tmdbKey, 'movie')
        );

        // 5. Trakt Filtered
        await testCatalog("Trakt Filtered", () => 
            buildTraktFilteredCatalog(userId, context, traktToken, tmdbKey, 'movie')
        );

        const outputPath = path.join(__dirname, 'catalog_test_results.json');
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
        console.log(`\nResults written to ${outputPath}`);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
