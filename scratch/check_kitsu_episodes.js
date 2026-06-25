require('dotenv').config();
const mongoose = require('mongoose');
const { fetchKitsuEpisodes } = require('../src/clients/kitsu');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    const eps = await fetchKitsuEpisodes('50550');
    console.log(`Fetched ${eps?.length || 0} episodes for kitsu:50550`);
    if (eps && eps.length > 0) {
        console.log("Latest 2 eps:", eps.slice(-2));
    }
}

test().catch(console.error);
