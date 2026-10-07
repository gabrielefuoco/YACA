const { connectMongo } = require('../../src/utils/mongoConnect');
const mongoose = require('mongoose');
require('dotenv').config();
const { buildSharedHeroCatalogs } = require('../../src/engines/hybridRecommendations');
const duckDbStore = require('../../src/db/duckDbStore');
const animeMappingStore = require('../../src/data/animeMappingStore');

async function main() {
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    await duckDbStore.init();
    await animeMappingStore.init();

    const UserAccount = require('../../src/db/models/UserAccount');
    const account = await UserAccount.findOne({ userId: 'REOZrGNRr3' });
    const tmdbKey = account?.apiKeys?.tmdb;

    // Hook into console to see pool lengths
    const res = await buildSharedHeroCatalogs({
        userId: 'REOZrGNRr3',
        context: '1c1da0af',
        mediaType: 'series',
        traktToken: null,
        tmdbApiKey: tmdbKey,
        kidsMode: false,
        userConfig: null,
        typeSelectors: { film: false, serie: false, anime: null }
    });

    console.log('Result assigned:');
    for (const [k, v] of Object.entries(res.catalogs)) {
        console.log(`  ${k}: ${v.length}`);
    }

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
