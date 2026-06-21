require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const { streamHandler } = require('../src/handlers/streamHandler');

async function test() {
    try {
        await mongoose.connect('mongodb+srv://Gabriele29:Valetta.012@atlascluster.dtgloub.mongodb.net/yaca?appName=AtlasCluster');
        console.log("Connected to MongoDB");

        process.env.PROXY_ADDON_URL = "https://icv.stremio-italia.eu/eyJ0bWRiX2tleSI6IjU0NjJmNzg0NjlmM2Q4MGJmNTIwMTY0NTI5NGMxNmU0IiwidXNlX2NvcnNhcm9uZXJvIjpmYWxzZSwidXNlX3VpbmRleCI6ZmFsc2UsInVzZV9rbmFiZW4iOnRydWUsInVzZV90b3JyZW50Z2FsYXh5Ijp0cnVlLCJ1c2VfdG9ycmVudGlvIjp0cnVlLCJ1c2VfbWVkaWFmdXNpb24iOnRydWUsInVzZV9jb21ldCI6dHJ1ZSwidXNlX3N0cmVtdGhydV90b3J6Ijp0cnVlLCJ1c2VfbWV0ZW9yIjp0cnVlLCJ1c2VfcmFyYmciOnRydWUsInVzZV9qYWNrZXR0Ijp0cnVlLCJmdWxsX2l0YSI6ZmFsc2UsImRiX29ubHkiOmZhbHNlLCJ1c2VfZ2xvYmFsX2NhY2hlIjpmYWxzZSwib25seV9kZWJyaWRfY2FjaGUiOmZhbHNlLCJoeWJyaWRfbW9kZSI6dHJ1ZSwiZm9ybWF0dGVyX3ByZXNldCI6Iml0YWxpYW5vIn0/manifest.json";

        const { resolveImdbId } = require('../src/clients/tmdb');
        const apiKey = process.env.TMDB_API_KEY || "e1b20dfa3182b8344e7300c3c861ed05";
        const imdbId = await resolveImdbId('24428', 'movie', apiKey);
        console.log("Direct resolveImdbId:", imdbId);
    } catch(e) {
        console.error("ERROR:", e);
    }
    process.exit(0);
}

test();
