require('dotenv').config();
const { getKitsuIdFromAnilist } = require('../src/clients/kitsu');

async function test() {
    console.log("Testing Steins;Gate (Anilist: 9253)...");
    const kitsuId = await getKitsuIdFromAnilist('9253');
    console.log("Kitsu ID:", kitsuId);
}
test().catch(console.error);
