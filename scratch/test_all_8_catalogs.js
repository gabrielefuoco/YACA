require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const { getEngineHybridCatalog } = require('../src/catalog/providers/HybridProvider');

async function testAll() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    
    // 1. Resolve first user
    const account = await UserAccount.findOne().lean();
    if (!account) {
        console.error("❌ No user accounts found in DB!");
        await mongoose.disconnect();
        return;
    }
    console.log(`✅ Using account: ${account.userId}`);
    
    const config = await AddonConfig.findOne({ uuid: account.addonUuid }).lean();
    if (!config) {
        console.error("❌ No addon configuration found!");
        await mongoose.disconnect();
        return;
    }
    
    // Find 'test' profile, or any profile
    const profile = config.profiles.find(p => p.name === 'test') || config.profiles[0];
    console.log(`✅ Using profile: "${profile.name}" (ID: ${profile.id})`);
    
    const userConfig = {
        userId: account.userId,
        apiKeys: { 
            trakt: account.apiKeys?.trakt || account.trakt?.accessToken,
            tmdb: account.apiKeys?.tmdb || process.env.TMDB_API_KEY,
            mistral: account.apiKeys?.mistral || process.env.MISTRAL_API_KEY
        },
        activeProfileId: profile.id,
        config: { hideWatched: false },
        profiles: config.profiles
    };

    const catalogs = [
        { id: 'yaca_true_blend_movies', type: 'movie', label: '🎯 True Blend - Film (AI)' },
        { id: 'yaca_true_blend_series', type: 'series', label: '🎯 True Blend - Serie (AI)' },
        { id: 'yaca_hidden_gems_movies', type: 'movie', label: '💎 Hidden Gems - Film (AI)' },
        { id: 'yaca_hidden_gems_series', type: 'series', label: '💎 Hidden Gems - Serie (AI)' },
        { id: 'yaca_seed_network_movies', type: 'movie', label: '🕸️ Seed Network - Film (Algo)' },
        { id: 'yaca_seed_network_series', type: 'series', label: '🕸️ Seed Network - Serie (Algo)' },
        { id: 'yaca_trakt_filtered_movies', type: 'movie', label: '🌐 Trakt Filtered - Film (Algo)' },
        { id: 'yaca_trakt_filtered_series', type: 'series', label: '🌐 Trakt Filtered - Serie (Algo)' }
    ];

    console.log("\n=================== STARTING HYBRID CATALOGS TEST ===================");
    
    for (const cat of catalogs) {
        console.log(`\nTesting: ${cat.label}...`);
        const startTime = Date.now();
        try {
            const results = await getEngineHybridCatalog(cat.id, cat.type, 0, userConfig, process.env.TMDB_API_KEY);
            const duration = Date.now() - startTime;
            
            if (Array.isArray(results)) {
                console.log(`✅ SUCCESS - Returned ${results.length} items (Took ${duration}ms)`);
                if (results.length > 0) {
                    console.log("   First 3 items:");
                    results.slice(0, 3).forEach((item, idx) => {
                        console.log(`     ${idx + 1}. ${item.name} (${item.type}) [ID: ${item.id}]`);
                    });
                } else {
                    console.log("   ⚠️ Empty catalog!");
                }
            } else {
                console.error(`❌ FAILED - Returned non-array result:`, results);
            }
        } catch (err) {
            console.error(`❌ EXCEPTION in ${cat.id}:`, err.message);
        }
    }
    
    console.log("\n=================== TESTING AI FALLBACK PATHS ===================");
    console.log("\nSimulating call with NO Mistral Key (forcing fallback to Algorithmic)...");
    
    const fallbackUserConfig = {
        ...userConfig,
        apiKeys: {
            ...userConfig.apiKeys,
            mistral: undefined // Force missing key
        }
    };
    
    const aiCatalogs = catalogs.filter(c => c.id.includes('true_blend') || c.id.includes('hidden_gems'));
    for (const cat of aiCatalogs) {
        console.log(`Testing Fallback for: ${cat.label}...`);
        const startTime = Date.now();
        try {
            const results = await getEngineHybridCatalog(cat.id, cat.type, 0, fallbackUserConfig, process.env.TMDB_API_KEY);
            const duration = Date.now() - startTime;
            console.log(`✅ FALLBACK SUCCESS - Returned ${results.length} items (Took ${duration}ms)`);
            if (results.length > 0) {
                console.log(`   Sample item: ${results[0].name} (${results[0].type})`);
            }
        } catch (err) {
            console.error(`❌ FALLBACK EXCEPTION in ${cat.id}:`, err.message);
        }
    }

    console.log("\n=================== TESTS COMPLETE ===================");
    await mongoose.disconnect();
}

testAll().catch(err => {
    console.error("Fatal Test Error:", err);
});
