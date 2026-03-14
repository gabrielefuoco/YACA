require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const TasteProfile = require('../src/models/TasteProfile');
const ProfileBuilder = require('../src/profile/ProfileBuilder');

/**
 * Mocking TMDB Detail Fetching to avoid real API calls
 */
const tmdb = require('../src/clients/tmdb');
const originalGetDetails = tmdb.getTmdbMovieDetails;

tmdb.getTmdbMovieDetails = async (apiKey, id, type) => {
    // Mock data based on ID
    if (id === 'anime_1') {
        return {
            genres: [{ id: 16, name: 'Animation' }, { id: 10759, name: 'Action & Adventure' }],
            keywords: { keywords: [{ id: 210024, name: 'anime' }] }
        };
    }
    if (id.startsWith('action_')) {
        return {
            genres: [{ id: 28, name: 'Action' }],
            keywords: { keywords: [{ id: 9715, name: 'superhero' }] }
        };
    }
    return { genres: [], keywords: { keywords: [] } };
};

async function runTest() {
    const TEST_USER_ID = 'test_integrated_user_' + Date.now();
    const PROFILE_ANIME = 'profile_anime';
    const PROFILE_GLOBAL = 'global';

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🚀 Starting Integrated Profile DNA Test');

        // 1. Setup User
        const user = new User({
            userId: TEST_USER_ID,
            email: 'test@yaca.com',
            profiles: [
                {
                    id: PROFILE_GLOBAL,
                    name: 'Global Profile',
                    settings: { suggestedDNA: [], manualDNA: [] }
                },
                {
                    id: PROFILE_ANIME,
                    name: 'Anime Profile',
                    settings: { suggestedDNA: [], manualDNA: [] }
                }
            ],
            config: { activeProfileId: PROFILE_GLOBAL }
        });
        await user.save();
        console.log('✅ User created');

        // 2. TEST CASE 1: Catalog Sync (No Mirroring)
        console.log('\n--- PHASE 1: Catalog Sync (should NOT mirror) ---');
        const catalogItems = [
            { id: 'anime_1', type: 'series' }
        ];

        // Context is PROFILE_ANIME, stremioData is array (catalog)
        // syncStremioData(owner, stremioData, apiKey, context)
        await ProfileBuilder.syncStremioData(TEST_USER_ID, catalogItems, 'mock_key', PROFILE_ANIME);
        
        console.log('🔍 Fetching updated profiles...');
        let profileAnime = await TasteProfile.findOne({ owner: TEST_USER_ID, context: PROFILE_ANIME });
        if (!profileAnime) console.error('❌ TasteProfile for Anime not found!');
        console.log('📊 Anime TasteProfile Scores:', JSON.stringify({
            genres: Object.fromEntries(profileAnime?.genreScores || new Map()),
            keywords: Object.fromEntries(profileAnime?.keywordScores || new Map()),
        }, null, 2));
        
        console.log('🧪 Inferring DNA for Anime...');
        await ProfileBuilder.inferDNAFromProfile(profileAnime);

        let updatedUser = await User.findOne({ userId: TEST_USER_ID });
        console.log('📦 Updated User profiles IDs:', updatedUser.profiles.map(p => p.id));
        
        const animeProfile = updatedUser.profiles.find(p => p.id === PROFILE_ANIME);
        if (!animeProfile) {
            console.error('❌ Could not find Anime profile in user doc! Profiles available:', updatedUser.profiles);
            throw new Error('Anime profile disappeared!');
        }
        const globalProfile = updatedUser.profiles.find(p => p.id === PROFILE_GLOBAL);
        if (!globalProfile) throw new Error('Global profile not found!');
        
        const animeSettings = animeProfile.settings;
        const globalSettings = globalProfile.settings;

        console.log('📦 Anime Profile settings:', JSON.stringify(animeSettings, null, 2));
        console.log('📦 Global Profile settings:', JSON.stringify(globalSettings, null, 2));

        if (animeSettings.suggestedDNA && animeSettings.suggestedDNA.some(d => d.name === 'Animation')) {
            console.log('✅ PASS: Anime profile got the Animation trait.');
        } else {
            console.log('❌ FAIL: Anime profile missing Animation trait. DNA:', JSON.stringify(animeSettings.suggestedDNA));
            throw new Error('FAIL: Anime profile missing Animation trait.');
        }

        if (!globalSettings.suggestedDNA || globalSettings.suggestedDNA.length === 0) {
            console.log('✅ PASS: Global profile remains clean (no mirroring for catalog).');
        } else {
            console.log('❌ FAIL: Global profile contaminated:', JSON.stringify(globalSettings.suggestedDNA));
            throw new Error('FAIL: Global profile was contaminated by catalog sync!');
        }

        // 3. TEST CASE 2: History Sync (20% Mirroring)
        console.log('\n--- PHASE 2: History Sync (SHOULD mirror 20%) ---');
        const historyData = {
            library: [
                { id: 'action_1', type: 'movie' },
                { id: 'action_2', type: 'movie' },
                { id: 'action_3', type: 'movie' }
            ], 
            liked: [],
            loved: []
        };

        await ProfileBuilder.syncStremioData(TEST_USER_ID, historyData, 'mock_key', PROFILE_ANIME);
        
        console.log('🔍 Fetching profiles after history sync...');
        let profileGlobal = await TasteProfile.findOne({ owner: TEST_USER_ID, context: PROFILE_GLOBAL });
        let profileAnimeUpdated = await TasteProfile.findOne({ owner: TEST_USER_ID, context: PROFILE_ANIME });

        console.log('📊 Global TasteProfile Scores:', JSON.stringify({
            genres: Object.fromEntries(profileGlobal?.genreScores || new Map()),
            keywords: Object.fromEntries(profileGlobal?.keywordScores || new Map()),
        }, null, 2));

        console.log('🧪 Inferring DNA again...');
        await ProfileBuilder.inferDNAFromProfile(profileAnimeUpdated);
        await ProfileBuilder.inferDNAFromProfile(profileGlobal);

        updatedUser = await User.findOne({ userId: TEST_USER_ID });
        const animeProfile2 = updatedUser.profiles.find(p => p.id === PROFILE_ANIME);
        const globalProfile2 = updatedUser.profiles.find(p => p.id === PROFILE_GLOBAL);
        
        const animeSettings2 = animeProfile2.settings;
        const globalSettings2 = globalProfile2.settings;

        console.log('📊 Anime DNA after history:', JSON.stringify(animeSettings2.suggestedDNA));
        console.log('📊 Global DNA after history:', JSON.stringify(globalSettings2.suggestedDNA));

        const animeAction = animeSettings2.suggestedDNA.find(d => d.name === 'Action');
        const globalAction = globalSettings2.suggestedDNA.find(d => d.name === 'Action');

        if (animeAction && globalAction) {
            console.log('✅ PASS: History item mirrored to Global profile.');
        } else {
            console.log('❌ FAIL: Geometry sync did not mirror. Global DNA:', JSON.stringify(globalSettings2.suggestedDNA));
            throw new Error('FAIL: Geometry sync did not mirror to Global.');
        }

        console.log('\n🏆 ALL INTEGRATED TESTS PASSED!');

    } catch (err) {
        console.error('❌ TEST FAILED:', err);
    } finally {
        // Restore original function
        tmdb.getTmdbMovieDetails = originalGetDetails;
        // Cleanup
        await User.deleteMany({ userId: { $regex: /^test_integrated_user_/ } });
        await TasteProfile.deleteMany({ owner: { $regex: /^test_integrated_user_/ } });
        await mongoose.disconnect();
    }
}

runTest();
