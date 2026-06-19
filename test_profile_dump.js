require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('./src/db/models/UserAccount');
const AddonConfig = require('./src/db/models/AddonConfig');
const { isAnimeProfile } = require('./src/utils/animeModeFilters');

async function dump() {
    await mongoose.connect(process.env.MONGODB_URI);
    const account = await UserAccount.findOne().lean();
    if (account && account.addonUuid) {
        const config = await AddonConfig.findOne({ uuid: account.addonUuid }).lean();
        const testProfile = config.profiles.find(p => p.name === 'test');
        if (testProfile) {
            console.log("Catalogs in test profile:");
            testProfile.catalogs.forEach(c => console.log(`- ${c.id}`));
            
            // Simulation
            const isAnime = isAnimeProfile({ profiles: config.profiles }, testProfile.id);
            console.log("\nisAnimeProfile result:", isAnime);
        } else {
            console.log("No profile named 'test'");
        }
    }
    await mongoose.disconnect();
}
dump();
