const mongoose = require('mongoose');

async function test() {
    try {
        await mongoose.connect('mongodb+srv://Gabriele29:Valetta.012@atlascluster.dtgloub.mongodb.net/yaca?appName=AtlasCluster');
        console.log("Connected to MongoDB!");

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log("Collections:", collections.map(c => c.name).join(', '));

        const userAccounts = await mongoose.connection.db.collection('useraccounts').find().toArray();
        console.log("UserAccounts count:", userAccounts.length);
        if (userAccounts.length > 0) {
            console.log("Sample UserAccount:", JSON.stringify(userAccounts[0], null, 2));
        }

        const addonConfigs = await mongoose.connection.db.collection('addonconfigs').find().toArray();
        console.log("AddonConfigs count:", addonConfigs.length);
        if (addonConfigs.length > 0) {
            console.log("Sample AddonConfig:", JSON.stringify(addonConfigs[0], null, 2));
        }

        const userConfigs = await mongoose.connection.db.collection('userconfigs').find().toArray();
        console.log("UserConfigs (old) count:", userConfigs.length);
        if (userConfigs.length > 0) {
            console.log("Sample UserConfig:", JSON.stringify(userConfigs[0], null, 2));
        }

    } catch(e) {
        console.error("ERROR:", e);
    }
    process.exit(0);
}

test();
