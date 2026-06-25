require('dotenv').config();
const mongoose = require('mongoose');
const StreamBadge = require('../src/db/models/StreamBadge');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    const badges = await StreamBadge.find({ stremioId: { $regex: '50550' } }).lean();
    console.log(`Badges for 50550: ${badges.length}`);
    badges.forEach(b => console.log(b.stremioId, 'hasIta:', b.hasIta));
    mongoose.disconnect();
}

test().catch(console.error);
