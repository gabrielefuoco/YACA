require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');

async function checkDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB.");
        
        const accounts = await UserAccount.find({}).lean();
        console.log(`Found ${accounts.length} UserAccounts`);
        if (accounts.length > 0) {
            console.log("First account:", JSON.stringify(accounts[0], null, 2));
        }

        const configs = await AddonConfig.find({}).lean();
        console.log(`Found ${configs.length} AddonConfigs`);
        if (configs.length > 0) {
            console.log("First config UUID:", configs[0].uuid);
            console.log("First config Profiles count:", configs[0].profiles?.length);
            console.log("First config raw_ui_state:", JSON.stringify(configs[0].profiles?.[0]?.raw_ui_state, null, 2));
        }
    } catch (e) {
        console.error("Error:", e);
    } finally {
        mongoose.disconnect();
    }
}
checkDB();
