require('dotenv').config({ path: 'secrets.env' });
const mongoose = require('mongoose');
const UserLibraryItem = require('../src/db/models/UserLibraryItem');

async function reset() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);

    const result = await UserLibraryItem.updateMany(
        {}, 
        { $set: { mapped: false } }
    );
    
    console.log(`Reset completed. Modified ${result.modifiedCount} items.`);
    await mongoose.disconnect();
}

reset().catch(e => {
    console.error(e);
    process.exit(1);
});
