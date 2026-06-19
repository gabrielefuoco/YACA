require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const TasteProfile = require('../src/models/TasteProfile');
const UserConfig = require('../src/models/UserConfig');
const TmdbScoringData = require('../src/models/TmdbScoringData');
const scoringEngine = require('../src/engines/hybrid/scoringEngine');

// Overwrite the twoTierScore to support dynamic noLimit override BEFORE loading catalogStrategies
const originalTwoTierScore = scoringEngine.twoTierScore;
global.noLimitOverride = false;
global.bypassDbCache = false;

scoringEngine.twoTierScore = async function (pool, profile, options) {
    const finalOptions = { ...options, noLimit: global.noLimitOverride };
    let results;
    if (global.bypassDbCache) {
        // Temporarily stub MongoDB scoring cache to simulate 100% cache misses (forcing TMDB calls)
        const originalFind = TmdbScoringData.find;
        TmdbScoringData.find = () => ({
            lean: () => Promise.resolve([])
        });
        try {
            results = await originalTwoTierScore(pool, profile, finalOptions);
        } finally {
            TmdbScoringData.find = originalFind;
        }
    } else {
        results = await originalTwoTierScore(pool, profile, finalOptions);
    }
    console.log(`   [twoTierScore] Pool: ${pool.length} -> Survivors: ${results.length}`);
    return results;
};

const catalogStrategies = require('../src/engines/hybrid/catalogStrategies');

async function runBenchmark() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    
    const account = await UserAccount.findOne().lean();
    const userConfig = await UserConfig.resolveUserConfig(account.userId);
    const profileObj = userConfig.profiles.find(p => p.name === 'test') || userConfig.profiles[0];
    
    console.log(`\n=================== BENCHMARK CONFIGURATION ===================`);
    console.log(`User: ${account.userId}`);
    console.log(`Profile: "${profileObj.name}" (ID: ${profileObj.id})`);
    
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    const mediaType = 'movie'; // Let's use movies for testing
    
    const runTest = async (label, noLimit, bypassCache) => {
        global.noLimitOverride = noLimit;
        global.bypassDbCache = bypassCache;
        
        console.log(`\n🚀 Testing: [${label}]`);
        const start = Date.now();
        
        // Let's run True Blend Movies
        const ids = await catalogStrategies.buildTopGenresMixCatalog(account.userId, profileObj.id, tmdbApiKey, mediaType);
        const duration = Date.now() - start;
        
        console.log(`   - Time Taken: ${duration}ms`);
        console.log(`   - Output Items Count: ${ids.length}`);
        return { duration, ids };
    };
    
    // Scenario 1: Standard (With Pruning, DB Cache Active)
    const res1 = await runTest("Standard (Con Potatura a 80 + Cache MongoDB)", false, false);
    
    // Scenario 2: Without Pruning (No limits, DB Cache Active)
    const res2 = await runTest("Senza Limiti (No Pruning + Cache MongoDB)", true, false);
    
    // Scenario 3: Standard (With Pruning, DB Cache Miss / TMDB API calls forced)
    // We expect this to do up to 80 TMDB API calls (rate-limited in batches of 5 with 50ms delay)
    const res3 = await runTest("Standard (Con Potatura + Cache Miss Totale)", false, true);
    
    // Scenario 4: Without Pruning (No limits, DB Cache Miss / TMDB API calls forced)
    // We expect this to do a huge amount of TMDB API calls (equal to the size of the candidate pool)
    const res4 = await runTest("Senza Limiti (No Pruning + Cache Miss Totale)", true, true);
    
    console.log(`\n=================== BENCHMARK COMPARISON SUMMARY ===================`);
    console.log(`1. Standard (Con Potatura + Cache):   ${res1.duration}ms | Items: ${res1.ids.length}`);
    console.log(`2. Senza Limiti (No Pruning + Cache): ${res2.duration}ms | Items: ${res2.ids.length}`);
    console.log(`3. Standard (Con Potatura + Miss):    ${res3.duration}ms | Items: ${res3.ids.length}`);
    console.log(`4. Senza Limiti (No Pruning + Miss):  ${res4.duration}ms | Items: ${res4.ids.length}`);
    
    // Check if the order/ranking changed between pruning and no-pruning (with cache)
    const matchCount = res1.ids.slice(0, 20).filter(id => res2.ids.slice(0, 20).includes(id)).length;
    console.log(`\n🔍 Rank Consistency:`);
    console.log(`   - Of the top 20 items in the standard list, ${matchCount}/20 are also in the top 20 of the no-pruning list.`);
    console.log(`   - First item (Standard):   ${res1.ids[0]}`);
    console.log(`   - First item (No Pruning): ${res2.ids[0]}`);
    
    await mongoose.disconnect();
}

runBenchmark().catch(err => {
    console.error("Benchmark failed:", err);
});
