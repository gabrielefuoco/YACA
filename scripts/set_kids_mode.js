require('dotenv').config();
const mongoose = require('mongoose');
const AddonConfig = require('../src/db/models/AddonConfig');
const UserAccount = require('../src/db/models/UserAccount');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const account = await UserAccount.findOne({}).lean();
  const config = await AddonConfig.findOne({ uuid: account.addonUuid });
  
  // Find the otaku profile index
  const otakuIdx = config.profiles.findIndex(p => p.name.toLowerCase().includes('otaku'));
  if (otakuIdx === -1) {
    console.log('Otaku profile not found!');
    process.exit(1);
  }
  
  // Use markModified to ensure Mongoose writes the nested field
  config.profiles[otakuIdx].settings = config.profiles[otakuIdx].settings || {};
  config.profiles[otakuIdx].settings.kidsMode = true;
  config.markModified('profiles');
  await config.save();
  
  // Clear cache
  await mongoose.connection.collection('request_cache').deleteMany({});
  
  // Verify
  const updated = await AddonConfig.findOne({ uuid: account.addonUuid }).lean();
  const otaku = updated.profiles.find(p => p.name.toLowerCase().includes('otaku'));
  console.log('VERIFIED - kidsMode:', otaku.settings.kidsMode);
  console.log('activeProfileId:', updated.activeProfileId);
  
  process.exit(0);
}
test().catch(console.error);
