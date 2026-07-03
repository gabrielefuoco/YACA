require('dotenv').config({ path: 'secrets.env' });
const mongoose = require('mongoose');
const LibraryConverterService = require('../src/services/LibraryConverterService');
const UserAccount = require('../src/db/models/UserAccount');

async function test() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);

    const user = await UserAccount.findOne({});
    if (!user) {
        console.error('No user found');
        return process.exit(1);
    }

    console.log(`Starting library converter for user ${user.userId}...`);
    await LibraryConverterService.convertAll(user.userId, 'http://localhost:7000');

    console.log('Finished converter test.');
    await mongoose.disconnect();
}

test().catch(e => {
    console.error(e);
    process.exit(1);
});
