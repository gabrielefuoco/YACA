require('dotenv').config();
const connectDB = require('../../src/db/connection');
const mongoose = require('mongoose');

const TmdbToKitsuMapping = require('../../src/db/models/TmdbToKitsuMapping');

async function check() {
    await connectDB();
    const mapping = await TmdbToKitsuMapping.findOne({ tmdbId: '14606' });
    console.log("Mapping in DB:", mapping);
    await mongoose.disconnect();
    process.exit(0);
}

check();
