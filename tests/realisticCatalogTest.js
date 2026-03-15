require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const TasteProfile = require('../src/models/TasteProfile');
const ProfileBuilder = require('../src/profile/ProfileBuilder');

/**
 * This test fetches a REAL catalog from Cinemeta (Stremio's default addon)
 * to test how ProfileBuilder handles a large volume of actual metadata.
 */
async function testRealisticCatalog() {
    const TEST_USER_ID = 'real_catalog_user';
    const TEST_CONTEXT = 'global';
    const CINEMETA_URL = 'https://v3-cinemeta.strem.io/catalog/movie/top.json';

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📡 Connected to MongoDB');
        console.log(`🌐 Fetching real catalog from Cinemeta...`);

        // 1. Fetch real items
        const response = await axios.get(CINEMETA_URL);
        const metas = response.data.metas || [];
        console.log(`✅ Received ${metas.length} items from Cinemeta.`);

        if (metas.length === 0) throw new Error("No items received from Cinemeta");

        // 2. Prep UserAccount + AddonConfig & Profile (Two-Table Split)
        await TasteProfile.deleteMany({ owner: TEST_USER_ID });
        await UserAccount.deleteMany({ userId: TEST_USER_ID });

        const account = await UserAccount.create({
            userId: TEST_USER_ID,
            email: 'real@example.com',
            passwordHash: 'test-hash'
        });
        await AddonConfig.findOneAndUpdate(
            { uuid: account.addonUuid },
            { $set: { profiles: [{ id: TEST_CONTEXT, name: 'Realistic Profile' }] } },
            { upsert: true }
        );

        // 3. Process via ProfileBuilder
        console.log('\n--- PHASE 1: Processing Real Items ---');
        
        // Initialize sync status
        await TasteProfile.updateOne(
            { owner: TEST_USER_ID, context: 'global' },
            { $set: { 'syncStatus.isSyncing': true, 'syncStatus.total': metas.length, 'syncStatus.current': 0 } },
            { upsert: true }
        );

        // Fallback: If no TMDB key, simulate enrichment by converting Cinemeta genres to TMDB-like objects
        const tmdbKey = process.env.TMDB_KEY;
        if (!tmdbKey) {
            console.warn('⚠️ No TMDB_KEY found. Simulating metadata enrichment from Cinemeta genres...');
            const profileIncrements = {};
            metas.forEach(meta => {
                const mockTmdb = {
                    genres: (meta.genres || []).map((g, idx) => ({ id: 1000 + idx, name: g })),
                    release_date: meta.releaseInfo || "2020-01-01"
                };
                ProfileBuilder.processItem(mockTmdb, 1.0, profileIncrements);
            });
            await ProfileBuilder.saveAtomic(TEST_USER_ID, 'global', profileIncrements);
        } else {
            const stremioData = { library: metas };
            await ProfileBuilder.syncStremioData(TEST_USER_ID, stremioData, tmdbKey);
        }

        // 4. Verify results
        const profile = await TasteProfile.findOne({ owner: TEST_USER_ID, context: 'global' });
        console.log('\n📊 Sync Results:');
        console.log(`- Mapped Names Count: ${profile.idNames ? profile.idNames.size : 0}`);
        console.log(`- Top Genres identified:`, Array.from(profile.genreScores.entries()).sort((a,b) => b[1] - a[1]).slice(0, 5));
        
        if (profile.idNames.size > 0) {
            console.log('✅ PASS: Real items successfully mapped to readable names.');
        }

        // 5. Final Inference
        console.log('\n--- PHASE 2: Running DNA Inference ---');
        await ProfileBuilder.inferDNAFromProfile(profile);

        // Read DNA from AddonConfig (not UserAccount — Two-Table Split)
        const updatedAccount = await UserAccount.findOne({ userId: TEST_USER_ID });
        const updatedConfig = await AddonConfig.findOne({ uuid: updatedAccount.addonUuid });
        const updatedProfile = updatedConfig.profiles.find(p => p.id === TEST_CONTEXT);
        const dnaCount = (updatedProfile?.settings?.suggestedDNA || []).length;

        console.log(`✅ DNA Inference complete. Suggested traits: ${dnaCount}`);
        
        if (dnaCount > 0) {
            console.log('\n🏆 REALISTIC CATALOG TEST PASSED!');
            console.log('The system successfully digested real Stremio metadata and extracted top traits.');
        }

    } catch (error) {
        console.error('❌ TEST FAILED:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

testRealisticCatalog();
