require('dotenv').config();
const mongoose = require('mongoose');
const { streamHandler } = require('../src/handlers/streamHandler');

async function testStream() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");
    
    // Assicura che CF_WORKER_URL sia impostato
    if (!process.env.CF_WORKER_URL) {
        process.env.CF_WORKER_URL = 'https://yaca-proxy-worker.gabriele-fuoco99.workers.dev';
    }
    
    console.log("Using CF_WORKER_URL:", process.env.CF_WORKER_URL);
    
    const args = { type: 'movie', id: 'tt0111161' };
    const userConfig = { userId: 'gabriele-fuoco99', apiKeys: {} };
    
    try {
        const result = await streamHandler(args, userConfig, 'http://localhost:7860');
        console.log("Streams found:", result?.streams?.length || 0);
        if (result?.streams?.length > 0) {
            console.log("First stream:", result.streams[0].name);
        }
    } catch (e) {
        console.error("Error:", e);
    }
    
    process.exit(0);
}

testStream();
