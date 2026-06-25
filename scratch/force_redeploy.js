require('dotenv').config();
const mongoose = require('mongoose');

async function forceRedeploy() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");
    
    const collection = mongoose.connection.db.collection('system_settings');
    const result = await collection.deleteOne({ key: 'cf_subdomain' });
    console.log("Deleted worker record:", result);
    
    process.exit(0);
}

forceRedeploy();
