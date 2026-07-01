require('dotenv').config({ path: 'secrets.env' });
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const res = await mongoose.connection.collection('cacheentries').deleteMany({ key: { $regex: 'kitsu|anilist' } });
    console.log('Deleted', res.deletedCount);
    mongoose.disconnect();
});
