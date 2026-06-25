const mongoose = require('mongoose');
require('dotenv').config();
const StreamBadge = require('../src/db/models/StreamBadge');
const PendingScan = require('../src/db/models/PendingScan');

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const baseId = 'kitsu:50550';
    const badges = await StreamBadge.find({ baseId }).lean();
    console.log("Badges for kitsu:50550:");
    badges.forEach(b => console.log(b.stremioId, 'hasIta:', b.hasIta, 'updatedAt:', b.updatedAt));

    const pending = await PendingScan.find({ baseId: { $regex: '50550' } }).lean();
    console.log("\nPending Scans for 50550:");
    pending.forEach(p => console.log(p.baseId, p.status));

    mongoose.disconnect();
}

check().catch(console.error);
