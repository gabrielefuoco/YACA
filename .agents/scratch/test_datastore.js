require('dotenv').config({ path: 'secrets.env' });
const mongoose = require('mongoose');
const { stremioClient } = require('../../src/clients/stremio');
const UserAccount = require('../../src/db/models/UserAccount');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    const user = await UserAccount.findOne({});
    const authKey = user.apiKeys?.stremio;

    try {
        const response = await stremioClient.post('/api/datastoreGet', {
            authKey: authKey,
            collection: 'libraryItem',
            all: true
        });
        console.log('Result length:', response.data.result ? response.data.result.length : 'No result array');
        if (response.data.result && response.data.result.length > 0) {
            console.log('Sample item:', response.data.result[0]);
        } else {
            console.log('Full response:', response.data);
        }
    } catch (e) {
        console.error('Error:', e.message, e.response?.data);
    }
    await mongoose.disconnect();
}
test();
