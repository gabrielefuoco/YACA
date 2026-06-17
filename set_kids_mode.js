require('dotenv').config();
const mongoose = require('mongoose');
const AddonConfig = require('./src/db/models/AddonConfig');
const UserAccount = require('./src/db/models/UserAccount');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const account = await UserAccount.findOne({ email: 'gabrielefuoco' }).lean() || await UserAccount.findOne({}).lean();
  
  await AddonConfig.updateOne(
    { uuid: account.addonUuid, 'profiles.id': 'otaku_hardcore' },
    { $set: { 'profiles.$.settings.kidsMode': true } }
  );
  
  // also clear mongoose directly
  await mongoose.connection.collection('request_cache').deleteMany({});
  
  console.log('Kids mode for otaku_hardcore set to TRUE and Cache Cleared');
  process.exit(0);
}
test().catch(console.error);
