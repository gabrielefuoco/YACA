require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const TasteProfile = require('../src/models/TasteProfile');
const { syncAllStremioData } = require('../src/utils/stremioSync');

async function testLiveSync() {
    const TARGET_EMAIL = 'gabriele.fuoco99@gmail.com';

    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const user = await User.findOne({ email: TARGET_EMAIL });
        if (!user) {
            console.error(`❌ User ${TARGET_EMAIL} not found!`);
            return;
        }
        
        console.log(`👤 Found user: ${user.userId}`);
        if (!user.apiKeys?.stremio) {
            console.error('❌ No Stremio API key found for user');
            return;
        }

        console.log(`🚀 Starting real syncAllStremioData...`);
        const result = await syncAllStremioData(user.userId, user.apiKeys.stremio);

        console.log(`📦 Sync Result:`, JSON.stringify(result, null, 2));

        if (result.success) {
            const profile = await TasteProfile.findOne({ owner: user.userId, context: 'global' });
            console.log(`\n📊 FINAL DNA STATS:`);
            console.log(`- Genre Counts: ${profile?.genreScores?.size || 0}`);
            console.log(`- Keyword Counts: ${profile?.keywordScores?.size || 0}`);
            console.log(`- Onboarding Completed: ${profile?.onboardingCompleted}`);
            
            if (profile?.idNames?.size > 0) {
                console.log('\n🏆 SUCCESS: DNA extracted from real Stremio catalogs!');
            }
        }

    } catch (e) {
        console.error('❌ CRITICAL ERROR:', e);
    } finally {
        await mongoose.disconnect();
        console.log('🏁 Test finished');
    }
}

testLiveSync();
