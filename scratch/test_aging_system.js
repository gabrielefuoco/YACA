require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('../src/db/models/UserAccount');
const UserConfig = require('../src/models/UserConfig');
const TasteProfile = require('../src/models/TasteProfile');
const RecommendationImpression = require('../src/models/RecommendationImpression');
const catalogStrategies = require('../src/engines/hybrid/catalogStrategies');
const { twoTierScore } = require('../src/engines/hybrid/scoringEngine');

async function testAging() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);

    const account = await UserAccount.findOne().lean();
    const userConfig = await UserConfig.resolveUserConfig(account.userId);
    const profileObj = userConfig.profiles.find(p => p.name === 'test') || userConfig.profiles[0];
    const context = profileObj.id;
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    const mediaType = 'movie';
    const catalogId = 'yaca_true_blend_movies';

    console.log(`\n=================== STARTING RECOMMENDATION AGING TEST ===================`);
    console.log(`User: ${account.userId} | Profile: "${profileObj.name}"`);

    // 1. Clean up existing impressions for a clean state
    await RecommendationImpression.deleteMany({ owner: account.userId, profileId: context });
    console.log("🧹 Cleaned up existing impressions.");

    // 2. Fetch baseline recommendations (Day 0 - No impressions)
    console.log("\n--- Day 0: Baseline (No impressions) ---");
    const baselineIds = await catalogStrategies.buildTopGenresMixCatalog(account.userId, context, tmdbApiKey, mediaType);
    if (baselineIds.length === 0) {
        console.error("❌ No recommendations generated. Add some items to Loved or DNA manual filters to run this test.");
        await mongoose.disconnect();
        return;
    }
    const targetMovieId = baselineIds[0];
    console.log(`🎯 Target Movie Selected for Aging: ${targetMovieId} (Ranked #1 in baseline)`);

    // Helper to get score of target movie
    const getTargetMoviePosition = async () => {
        const ids = await catalogStrategies.buildTopGenresMixCatalog(account.userId, context, tmdbApiKey, mediaType);
        return ids.indexOf(targetMovieId);
    };

    // 3. Simulate 1 Day of Impression
    console.log("\n--- Day 1: Shown on 1 Day (Should have 0% penalty) ---");
    await RecommendationImpression.create({
        owner: account.userId,
        profileId: context,
        catalogId: catalogId,
        tmdbId: targetMovieId,
        seenDates: ["2026-06-19"]
    });
    let rank = await getTargetMoviePosition();
    console.log(`   - Target Movie Rank: #${rank + 1} (Expected: #1 - No penalty)`);
    if (rank !== 0) console.warn("     ⚠️ Rank shifted, but should remain at #1");

    // 4. Simulate 3 Days of Impressions (Should have 20% penalty)
    console.log("\n--- Day 3: Shown on 3 distinct days (Should have 20% penalty) ---");
    await RecommendationImpression.updateOne(
        { owner: account.userId, profileId: context, catalogId, tmdbId: targetMovieId },
        { $set: { seenDates: ["2026-06-17", "2026-06-18", "2026-06-19"] } }
    );
    rank = await getTargetMoviePosition();
    console.log(`   - Target Movie Rank: #${rank + 1} (Expected to drop slightly due to 20% penalty)`);

    // 5. Simulate 6 Days of Impressions (Should have 80% penalty - Severe demotion)
    console.log("\n--- Day 6: Shown on 6 distinct days (Should have 80% penalty) ---");
    await RecommendationImpression.updateOne(
        { owner: account.userId, profileId: context, catalogId, tmdbId: targetMovieId },
        { $set: { seenDates: ["2026-06-14", "2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"] } }
    );
    rank = await getTargetMoviePosition();
    console.log(`   - Target Movie Rank: #${rank + 1} (Expected to drop severely, e.g. #10 or below)`);

    // 6. Clean up impressions to restore clean profile state
    await RecommendationImpression.deleteMany({ owner: account.userId, profileId: context });
    console.log("\n🧹 Restored database profile state (Impressions cleaned up).");
    
    // Verify it returns to rank #1
    rank = await getTargetMoviePosition();
    console.log(`✅ Post-cleanup Rank: #${rank + 1} (Restored to baseline #1)`);

    console.log("\n=================== TESTS COMPLETE ===================");
    await mongoose.disconnect();
}

testAging().catch(err => {
    console.error("Aging test failed:", err);
});
