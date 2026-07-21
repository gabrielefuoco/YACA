const mongoose = require('mongoose');
require('dotenv').config();

const UserAccount = require('../src/db/models/UserAccount');
const TasteProfile = require('../src/models/TasteProfile');
const AddonConfig = require('../src/db/models/AddonConfig');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB.");

        const users = await UserAccount.find().lean();
        console.log("Users:", users.map(u => u.userId));

        const configs = await AddonConfig.find().lean();
        console.log("AddonConfigs UUIDs:", configs.map(c => c.uuid));
        
        for (const config of configs) {
            console.log(`\nConfig UUID: ${config.uuid}, Owner: ${config.owner}`);
            if (config.profiles) {
                config.profiles.forEach(p => {
                    console.log(` - Profile: ${p.id} (${p.name}), Catalogs: ${p.catalogs?.length || 0}`);
                });
            }
        }

        const tasteProfiles = await TasteProfile.find().lean();
        console.log("\nTaste Profiles:");
        tasteProfiles.forEach(tp => {
            console.log(`- Owner: ${tp.owner}, Context: ${tp.context}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
run();
