require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { connectMongo } = require('C:/Users/gabri/APP/YACA/src/utils/mongoConnect');
(async () => {
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const db = mongoose.connection.db;
    const col = db.collection('watchhistories');
    console.log('documenti totali in watchhistories:', await col.countDocuments());
    const owners = await col.aggregate([{ $group: { _id: '$owner', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]).toArray();
    console.log('proprietari per numero di titoli:');
    for (const o of owners) console.log(`   ${o._id}: ${o.n} titoli`);
    const tot = await db.collection('tasteprofiles').countDocuments();
    console.log('profili (tasteprofiles):', tot);
    const byOwner = await db.collection('tasteprofiles').aggregate([{ $group: { _id: '$owner', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]).toArray();
    for (const o of byOwner) console.log(`   profilo ${o._id}: ${o.n} contesti`);
    await mongoose.disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
