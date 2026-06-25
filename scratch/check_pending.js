require('dotenv').config();
const mongoose = require('mongoose');
const PendingScan = require('../src/db/models/PendingScan');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    const items = await PendingScan.find().limit(50).lean();
    items.forEach(i => console.log(i.baseId, i.status));
    mongoose.disconnect();
}

test().catch(console.error);
