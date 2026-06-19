require('dotenv').config();
const mongoose = require('mongoose');

async function testConn() {
    console.log("Connecting to:", process.env.MONGODB_URI);
    try {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        console.log("SUCCESSFULLY CONNECTED TO MONGODB!");
        await mongoose.disconnect();
        console.log("Disconnected.");
    } catch (e) {
        console.error("CONNECTION ERROR:", e);
    }
}

testConn();
