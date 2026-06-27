const mongoose = require('mongoose');
require('dotenv').config();

async function clear() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB.");
        
        await mongoose.connection.db.collection('streambadges').deleteMany({});
        console.log("Cleared streambadges.");
        
        await mongoose.connection.db.collection('pendingscans').deleteMany({});
        console.log("Cleared pendingscans.");
        
        await mongoose.connection.db.collection('caches').deleteMany({});
        console.log("Cleared proxy_streams cache.");
        
        console.log("All caches cleared successfully!");
        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

clear();
