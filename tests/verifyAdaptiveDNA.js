require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const TasteProfile = require('../src/models/TasteProfile');
const ProfileBuilder = require('../src/profile/ProfileBuilder');

async function runTest() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const userId = 'lXI1NtNuGN';
        const context = '5e37f110';

        const profile = await TasteProfile.findOne({ owner: userId, context });
        if (!profile) {
            console.error('Profile not found.');
            process.exit(1);
        }

        console.log(`Testing DNA inference for User: ${userId}, Context: ${context}`);
        
        console.log('--- Before Inference ---');
        const userDocBefore = await User.findOne({ userId });
        const userProfileBefore = userDocBefore.profiles.find(p => p.id === context);
        console.log('Pending DNA Suggestions:', userProfileBefore.settings.pendingDNASuggestions);

        // Clear existing pending suggestions for testing purposes
        await User.findOneAndUpdate(
            { userId: userId, 'profiles.id': context },
            { $set: { 'profiles.$.settings.pendingDNASuggestions': [] } }
        );

        // Print score maps for debugging
        console.log('\n--- Score Maps ---');
        console.log('Genre Scores:');
        Array.from(profile.genreScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([id, score]) => console.log(`  ${id}: ${score.toFixed(2)}`));
            
        console.log('Keyword Scores:');
        Array.from(profile.keywordScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([id, score]) => console.log(`  ${id}: ${score.toFixed(2)}`));

        console.log('\nRunning inferDNAFromProfile...');
        await ProfileBuilder.inferDNAFromProfile(profile);

        console.log('\n--- After Inference ---');
        const userDocAfter = await User.findOne({ userId });
        const userProfileAfter = userDocAfter.profiles.find(p => p.id === context);
        console.log('New Pending DNA Suggestions:');
        userProfileAfter.settings.pendingDNASuggestions.forEach(s => {
            console.log(`- Type: ${s.type}, ID: ${s.id}, Name: ${s.name}`);
        });

    } catch (error) {
        console.error('Error during test:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

runTest();
