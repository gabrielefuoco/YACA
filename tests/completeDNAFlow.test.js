require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const TasteProfile = require('../src/models/TasteProfile');
const ProfileBuilder = require('../src/profile/ProfileBuilder');

async function testCompleteFlow() {
    const TEST_USER_ID = 'e2e_dna_user';
    const TEST_CONTEXT = 'e2e_dna_context';

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🚀 Starting Complete DNA Flow E2E Test');

        // 0. Cleanup
        await TasteProfile.deleteMany({ owner: TEST_USER_ID });
        await UserAccount.deleteMany({ userId: TEST_USER_ID });

        // 1. Initial State (Two-Table Split: create UserAccount + AddonConfig)
        const account = new UserAccount({
            userId: TEST_USER_ID,
            email: 'e2e@example.com',
            passwordHash: 'e2e_placeholder_hash'
        });
        await account.save();

        const addonConfig = new AddonConfig({
            uuid: account.addonUuid,
            profiles: [{
                id: TEST_CONTEXT,
                name: 'E2E Profile',
                settings: { suggestedDNA: [], manualDNA: [] }
            }]
        });
        await addonConfig.save();
        console.log('✅ UserAccount + AddonConfig created (onboardingCompleted: false)');

        // 2. Simulate First Sync (Onboarding)
        console.log('\n--- PHASE 1: Initial Sync ---');
        const item1 = {
            genres: [{ id: 28, name: 'Action' }],
            keywords: { keywords: [{ id: 12377, name: 'Cyberpunk' }] }
        };

        // Initialize syncStatus
        await TasteProfile.updateOne(
            { owner: TEST_USER_ID, context: TEST_CONTEXT },
            { $set: { 'syncStatus.isSyncing': true, 'syncStatus.total': 1, 'syncStatus.current': 0 } },
            { upsert: true }
        );

        const increments = {};
        for(let i=0; i<10; i++) ProfileBuilder.processItem(item1, 1.0, increments);
        await ProfileBuilder.saveAtomic(TEST_USER_ID, TEST_CONTEXT, increments);
        
        let profile = await TasteProfile.findOne({ owner: TEST_USER_ID, context: TEST_CONTEXT });
        await ProfileBuilder.inferDNAFromProfile(profile);

        let updatedAddon = await AddonConfig.findOne({ uuid: account.addonUuid });
        let updatedProfile = updatedAddon.profiles.find(p => p.id === TEST_CONTEXT);
        
        console.log('📊 Result Phase 1:');
        console.log('- Suggested DNA length:', updatedProfile.settings.suggestedDNA.length);
        console.log('- Manual DNA length:', updatedProfile.settings.manualDNA.length);
        if (updatedProfile.settings.suggestedDNA.length > 0 && updatedProfile.settings.manualDNA.length === 0) {
            console.log('✅ PASS: Traits are suggested, not confirmed.');
        } else {
            throw new Error('FAIL: Initial sync should result in suggested DNA only.');
        }

        // 3. Confirm DNA (Onboarding completion)
        console.log('\n--- PHASE 2: Confirmation ---');
        const suggested = updatedProfile.settings.suggestedDNA;
        await AddonConfig.updateOne(
            { uuid: account.addonUuid, 'profiles.id': TEST_CONTEXT },
            { $set: { 
                'profiles.$.settings.manualDNA': suggested, 
                'profiles.$.settings.suggestedDNA': [] 
            }}
        );
        await TasteProfile.updateOne(
            { owner: TEST_USER_ID, context: TEST_CONTEXT },
            { $set: { onboardingCompleted: true } }
        );
        console.log('✅ DNA Confirmed. onboardingCompleted set to true.');

        // 4. Simulate Background Sync (Automatic activation)
        console.log('\n--- PHASE 3: Automatic Background Sync ---');
        const item2 = {
            genres: [{ id: 35, name: 'Comedy' }],
            keywords: { keywords: [{ id: 9715, name: 'Superhero' }] }
        };

        const increments2 = {};
        for(let i=0; i<10; i++) ProfileBuilder.processItem(item2, 1.0, increments2);
        await ProfileBuilder.saveAtomic(TEST_USER_ID, TEST_CONTEXT, increments2);
        
        profile = await TasteProfile.findOne({ owner: TEST_USER_ID, context: TEST_CONTEXT });
        await ProfileBuilder.inferDNAFromProfile(profile);

        updatedAddon = await AddonConfig.findOne({ uuid: account.addonUuid });
        updatedProfile = updatedAddon.profiles.find(p => p.id === TEST_CONTEXT);

        console.log('📊 Result Phase 3:');
        console.log('- Total confirmed DNA length:', updatedProfile.settings.manualDNA.length);
        const hasComedy = updatedProfile.settings.manualDNA.some(d => d.name === 'Comedy');
        if (hasComedy) {
            console.log('✅ PASS: New traits automatically added to manualDNA.');
        } else {
            throw new Error('FAIL: New traits should be auto-activated after onboarding.');
        }

        // 5. Verify Sync Reset
        console.log('\n--- PHASE 4: Status Reset ---');
        profile = await TasteProfile.findOne({ owner: TEST_USER_ID, context: TEST_CONTEXT });
        console.log('- isSyncing status:', profile.syncStatus.isSyncing);
        if (profile.syncStatus.isSyncing === false) {
            console.log('✅ PASS: isSyncing reset to false after inference.');
        } else {
            throw new Error('FAIL: isSyncing should be false.');
        }

        console.log('\n🏆 ALL E2E FLOWS PASSED!');

    } catch (error) {
        console.error('❌ TEST FAILED:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

testCompleteFlow();
