require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('./src/db/models/UserAccount');

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const account = await UserAccount.findOne().lean();
    if (account) {
        console.log("Account apiKeys:", account.apiKeys);
    } else {
        console.log("No accounts found.");
    }
    await mongoose.disconnect();
}
check();
