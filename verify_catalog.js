require('dotenv').config();
const mongoose = require('mongoose');
const { buildHybridCatalog } = require('./src/engines/hybrid/catalogStrategies');
const tmdb = require('./src/clients/tmdb');
const UserAccount = require('./src/db/models/UserAccount');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB.");

        // Find all users and check their addon configurations
        const users = await UserAccount.find().lean();
        const AddonConfig = require('./src/db/models/AddonConfig');
        const configs = await AddonConfig.find().lean();
        
        let targetUser = null;
        for (const config of configs) {
            if (config.profiles && config.profiles.some(p => p.id === 'global')) {
                // Let's just pick the first config
                console.log(`Found config for uuid: ${config.uuid}, presets: ${JSON.stringify(config.profiles.map(p => p.presets))}`);
            }
        }
        
        const user = users.find(u => u.addonUuid === configs[0]?.uuid) || users[0];

        const userId = user.userId;
        const tmdbKey = user.apiKeys?.tmdb || process.env.TMDB_API_KEY;
        const traktToken = user.apiKeys?.traktToken;
        const { processProfiles } = require('./src/api/configure/profileProcessor');
        
        // Mock profile input for Otaku Hardcore preset
        const mockInputProfiles = [{
            id: 'global',
            selectedPresets: ['preset_pop_anime', 'preset_new_anime', 'preset_anime_classics'] // what tpl_otaku expands to
        }];
        
        // Run processProfiles to generate catalogs and suggestedDNA
        const warnings = [];
        const processedProfiles = await processProfiles(mockInputProfiles, userId, null, warnings);
        console.log(`Suggested DNA: ${JSON.stringify(processedProfiles[0].settings.suggestedDNA)}`);

        // Instead of mocking, write to DB so destructured requires work
        await AddonConfig.updateOne(
            { uuid: configs[0].uuid },
            { $set: { "profiles.0.settings": processedProfiles[0].settings, "profiles.0.catalogs": processedProfiles[0].catalogs } }
        );

        const strategies = require('./src/engines/hybrid/catalogStrategies');
        
        console.log(`\nVerifying catalogs for user: ${userId}`);

        const testStrategy = async (name, promiseFn) => {
            console.log(`\n--- Test: ${name} ---`);
            const movieIds = await promiseFn();
            console.log(`Found ${movieIds.length} movies.`);
            
            const client = tmdb.createTmdbClient(tmdbKey);
            for (let i = 0; i < Math.min(5, movieIds.length); i++) {
                try {
                    const res = await client.get(`/movie/${movieIds[i]}`, { params: { language: 'it-IT' } });
                    console.log(`  - ${res.data.title} (ID: ${movieIds[i]}) [Genres: ${res.data.genres.map(g => g.name).join(', ')}]`);
                } catch(e) {
                    console.log(`  - ID: ${movieIds[i]} (Error fetching details)`);
                }
            }
        };

        // Otaku preset id is '5' or something like that, but let's just test with top genres for the user.
        await testStrategy("Top Genres Mix", () => strategies.buildTopGenresMixCatalog(userId, 'global', tmdbKey, 'movie'));
        await testStrategy("Hybrid Catalog (Rete Preferiti)", () => strategies.buildHybridCatalog(userId, 'global', traktToken, tmdbKey, 'movie'));
        await testStrategy("Hidden Gems", () => strategies.buildHiddenGemsCatalog(userId, 'global', tmdbKey, 'movie'));
        await testStrategy("Trakt Filtered", () => strategies.buildTraktFilteredCatalog(userId, 'global', traktToken, tmdbKey, 'movie'));

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
