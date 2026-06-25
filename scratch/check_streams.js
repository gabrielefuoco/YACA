require('dotenv').config();
const mongoose = require('mongoose');
const { streamHandler } = require('../src/handlers/streamHandler');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const userConfig = {
        userId: 'test_user',
        apiKeys: { tmdb: process.env.TMDB_API_KEY },
        settings: {}
    };

    const hostUrl = 'http://localhost:3000';
    
    console.log("Fetching streams for kitsu:50550:12 ...");
    const result = await streamHandler({ id: 'kitsu:50550:1:12', type: 'series' }, userConfig, hostUrl);
    
    console.log(`Found ${result.streams?.length || 0} streams.`);
    
    if (result.streams) {
        result.streams.forEach((s, i) => {
            console.log(`\nStream ${i+1}:`);
            console.log(s.title);
        });
    }
}

test().catch(console.error);
