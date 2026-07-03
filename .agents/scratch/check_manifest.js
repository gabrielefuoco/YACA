require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const UserAccount = require('../../src/db/models/UserAccount');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const targetUser = await UserAccount.findOne({});
        const authKey = targetUser.apiKeys?.stremio;
        
        // get addon key
        const addonKeyRes = await axios.get(`https://likes.stremio.com/getAddonKey?key=${authKey}`);
        const addonKey = addonKeyRes.data;
        
        const lovedUrl = `https://likes.stremio.com/addons/loved/movies-shows/user=${addonKey}/manifest.json`;
        const likedUrl = `https://likes.stremio.com/addons/liked/movies-shows/user=${addonKey}/manifest.json`;
        
        console.log("Fetching Loved Manifest...");
        const loved = await axios.get(lovedUrl);
        console.log(JSON.stringify(loved.data.catalogs, null, 2));

        console.log("Fetching Liked Manifest...");
        const liked = await axios.get(likedUrl);
        console.log(JSON.stringify(liked.data.catalogs, null, 2));

    } catch (err) {
        console.error("Error:", err.message);
        if (err.response) console.error(err.response.data);
    } finally {
        await mongoose.disconnect();
    }
}
run();
