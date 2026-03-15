require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const TasteProfile = require('../src/models/TasteProfile');
const ProfileBuilder = require('../src/profile/ProfileBuilder');

async function runTest() {
    const TEST_USER_ID = 'test_dna_user';
    const TEST_CONTEXT = 'test_dna_context';

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Cleanup old test data
        await TasteProfile.deleteMany({ owner: TEST_USER_ID });
        await UserAccount.deleteMany({ userId: TEST_USER_ID });

        // 2. Create mock UserAccount + AddonConfig (Two-Table Split)
        const account = await UserAccount.create({
            userId: TEST_USER_ID,
            email: 'test@example.com',
            passwordHash: 'test-hash'
        });
        await AddonConfig.findOneAndUpdate(
            { uuid: account.addonUuid },
            { $set: { profiles: [{
                id: TEST_CONTEXT,
                name: 'Test Profile',
                settings: {
                    suggestedDNA: [],
                    manualDNA: []
                }
            }] } },
            { upsert: true }
        );
        console.log('Created mock user (Two-Table Split)');

        // 3. Process mock items to build profile
        console.log('\n--- Processing Mock Item 1 (Cyberpunk Action) ---');
        const item1 = {
            genres: [
                { id: 28, name: 'Action' },
                { id: 878, name: 'Science Fiction' }
            ],
            keywords: {
                keywords: [
                    { id: 12377, name: 'Cyberpunk' },
                    { id: 9663, name: 'Future' }
                ]
            }
        };

        // Run processItem multiple times to exceed thresholds
        const increments = {};
        for(let i=0; i<5; i++) {
            ProfileBuilder.processItem(item1, 1.0, increments);
        }
        await ProfileBuilder.saveAtomic(TEST_USER_ID, TEST_CONTEXT, increments);

        // 4. Verify idNames and scores in DB
        let profile = await TasteProfile.findOne({ owner: TEST_USER_ID, context: TEST_CONTEXT });
        console.log('\nVerified Profile Persistence:');
        console.log('- Genre 28 Score:', profile.genreScores.get('28'));
        console.log('- Keyword 12377 Name in DB:', profile.idNames.get('12377'));

        // 5. Run DNA Inference
        console.log('\nRunning inferDNAFromProfile...');
        await ProfileBuilder.inferDNAFromProfile(profile);

        // 6. Assert result in AddonConfig settings (Two-Table Split)
        const updatedAccount = await UserAccount.findOne({ userId: TEST_USER_ID });
        const updatedConfig = await AddonConfig.findOne({ uuid: updatedAccount.addonUuid });
        const updatedProfile = updatedConfig.profiles.find(p => p.id === TEST_CONTEXT);
        
        console.log('\n--- Final DNA Results ---');
        const dna = updatedProfile.settings.suggestedDNA || [];
        if (dna.length === 0) {
            console.error('FAIL: No DNA suggested!');
        } else {
            dna.forEach(trait => {
                console.log(`[Trait] Type: ${trait.type}, ID: ${trait.id}, Name: ${trait.name}`);
                if (trait.id === '12377' && trait.name === 'Cyberpunk') {
                    console.log('SUCCESS: Cyberpunk keyword mapped correctly!');
                }
                if (trait.id === '28' && trait.name === 'Action') {
                    console.log('SUCCESS: Action genre mapped correctly!');
                }
            });
        }

    } catch (error) {
        console.error('Error during test:', error);
    } finally {
        // Optional: Cleanup
        // await TasteProfile.deleteMany({ owner: TEST_USER_ID });
        // await UserAccount.deleteMany({ userId: TEST_USER_ID });
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

runTest();
