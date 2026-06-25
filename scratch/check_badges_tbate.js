const mongoose = require('mongoose');
require('dotenv').config();
const StreamBadge = require('../src/db/models/StreamBadge');
const PendingScan = require('../src/db/models/PendingScan');

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Find The Banished Former Hero by text search? Or just list recently added badges.
    const badges = await StreamBadge.find({ hasIta: true }).sort({ updatedAt: -1 }).limit(50);
    console.log("Recent ITA Badges:", badges.map(b => b.stremioId));

    // Also let's check PendingScan
    const pending = await PendingScan.find({ status: 'pending' }).countDocuments();
    console.log("Pending scans total:", pending);

    mongoose.disconnect();
}

check().catch(console.error);
