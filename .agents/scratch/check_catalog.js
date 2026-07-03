require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const UserAccount = require('../../src/db/models/UserAccount');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const targetUser = await UserAccount.findOne({});
        const authKey = targetUser.apiKeys?.stremio;
        
        const addonKeyRes = await axios.get(`https://likes.stremio.com/getAddonKey?key=${authKey}`);
        const addonKey = addonKeyRes.data;
        
        const lovedMovieUrl = `https://likes.stremio.com/addons/loved/movies-shows/user=${addonKey}/catalog/movie/stremio-loved-movie.json`;
        console.log("Fetching Loved Movie Catalog...");
        console.log("URL:", lovedMovieUrl);
        
        try {
            const res = await axios.get(lovedMovieUrl);
            console.log(JSON.stringify(res.data, null, 2));
        } catch (e) {
            console.log("Error fetching catalog:", e.response?.data || e.message);
        }

    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        await mongoose.disconnect();
    }
}
run();
