const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const account = await db.collection('useraccounts').findOne({});
    if (account) {
        console.log("Found User ID:", account.userId);
        console.log("Found Addon UUID:", account.addonUuid);
    } else {
        console.log("No user accounts found.");
    }
    process.exit(0);
}
run().catch(console.error);
