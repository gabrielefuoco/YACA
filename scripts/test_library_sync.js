require('dotenv').config({ path: 'secrets.env' });
const mongoose = require('mongoose');
const LibrarySyncService = require('../src/services/LibrarySyncService');
const UserLibraryItem = require('../src/db/models/UserLibraryItem');
const UserAccount = require('../src/db/models/UserAccount');

async function test() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);

    const user = await UserAccount.findOne({});
    if (!user) {
        console.error('No user found');
        return process.exit(1);
    }

    console.log(`Starting sync for user ${user.userId}...`);
    await LibrarySyncService.syncLibraryForUser(user.userId);

    console.log('Sync finished. Checking UserLibraryItem collection...');
    
    const count = await UserLibraryItem.countDocuments({ addonUuid: user.addonUuid });
    console.log(`Total library items saved: ${count}`);

    const moviesCount = await UserLibraryItem.countDocuments({ addonUuid: user.addonUuid, type: 'movie' });
    const seriesCount = await UserLibraryItem.countDocuments({ addonUuid: user.addonUuid, type: 'series' });
    const animeCount = await UserLibraryItem.countDocuments({ addonUuid: user.addonUuid, type: 'anime' });

    console.log(`Movies: ${moviesCount}`);
    console.log(`Series: ${seriesCount}`);
    console.log(`Anime: ${animeCount}`);

    const sample = await UserLibraryItem.findOne({ addonUuid: user.addonUuid });
    console.log('Sample item:', JSON.stringify(sample, null, 2));

    await mongoose.disconnect();
}

test().catch(e => {
    console.error(e);
    process.exit(1);
});
