require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const TasteProfile = require('../src/models/TasteProfile');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB.");

        const configs = await AddonConfig.find().lean();
        let targetConfig = null;
        
        for (const config of configs) {
            const hasOtaku = config.profiles?.some(p => p.presets?.includes('tpl_otaku') || p.presets?.includes('otaku_hardcore'));
            if (hasOtaku) {
                targetConfig = config;
                console.log(`Found config with Otaku preset! UUID: ${config.uuid}`);
                break;
            }
        }

        if (targetConfig) {
            const user = await UserAccount.findOne({ addonUuid: targetConfig.uuid }).lean();
            if (user) {
                console.log(`User ID: ${user.userId}`);
                const profile = await TasteProfile.findOne({ owner: user.userId }).lean();
                if (profile) {
                    console.log(`Profile exists. Items watched: ${profile.sources?.traktHistory || 0}`);
                    console.log(`V_final keys count: ${Object.keys(profile.compiledVectors?.V_final || {}).length}`);
                } else {
                    console.log(`No TasteProfile found for this user.`);
                }
            } else {
                console.log(`No UserAccount linked to this config.`);
            }
        } else {
            console.log(`No config found with the Otaku preset in the local DB.`);
        }

        const allUsers = await UserAccount.find().lean();
        console.log(`Total users in local DB: ${allUsers.length}`);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
