const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log("Connected to MongoDB.");
        const result = await mongoose.connection.db.collection('cacheentries').deleteMany({ namespace: 'proxy_streams' });
        console.log(`Deleted ${result.deletedCount} cached proxy streams.`);
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
