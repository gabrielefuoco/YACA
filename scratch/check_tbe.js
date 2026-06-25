require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    const StreamBadge = require('../src/db/models/StreamBadge');
    
    // Check various combinations for TMDB 274671
    const b1 = await StreamBadge.find({ baseId: { $regex: '274671' } }).lean();
    console.log('regex 274671:', b1);
    
    // The Beginning After the End is often mapped to Anilist -> Kitsu.
    // Let's search by name
    const b2 = await StreamBadge.find({ "stremioId": { $regex: 'kitsu:47083' } }).lean();
    console.log('regex kitsu:47083:', b2);

    process.exit(0);
}
test().catch(console.error);
