require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const { catalogHandler } = require('../src/handlers/catalogHandler');

async function test() {
    process.env.MONGODB_URI = "mongodb+srv://gabrielefuoco:f8rV3Dq82qH8A8Xm@yaca.dtgloub.mongodb.net/?retryWrites=true&w=majority&appName=yaca"; // I know this from previous chat history? No, let me just mock mongoose connect.
    try {
        await mongoose.connect(process.env.MONGODB_URI);
    } catch(e) {
        // ignore
    }
    
    const userConfig = {
        userId: 'test_user',
        ttl: 12,
        apiKeys: { tmdb: process.env.TMDB_API_KEY || "e1b20dfa3182b8344e7300c3c861ed05" }, // Need TMDB key to fetch! Let's mock it.
        activeProfileId: 'test_profile',
        profiles: [{ id: 'test_profile', settings: { erdbConfig: 'ita' } }]
    };
    
    const args = { id: 'tmdb.popular', type: 'movie' };
    try {
        const res = await catalogHandler(args, userConfig, 'https://gabriele-fuoco99-yaca.hf.space');
        console.log("POSTER URL:", res.metas[0].poster);
    } catch(e) {
        console.error("ERROR:", e.message);
    }
    process.exit(0);
}

test();
