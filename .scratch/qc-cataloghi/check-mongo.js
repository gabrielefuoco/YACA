const mongoose = require('mongoose');
require('dotenv').config();
const { connectMongo } = require('../../src/utils/mongoConnect');

async function check() {
  await connectMongo(process.env.MONGODB_URI, { mongoose });
  const db = mongoose.connection.db;
  const docs = await db.collection('tasteprofiles').find({ owner: 'REOZrGNRr3' }).project({ context: 1, 'compiledVectors.V_final': 1, updatedAt: 1 }).toArray();
  console.log('Real tasteprofiles for REOZrGNRr3:');
  for (const d of docs) {
    const keys = Object.keys(d.compiledVectors?.V_final || {});
    console.log(`- context: ${d.context}, keys: ${keys.length}, sample keys: ${keys.slice(0, 5).join(', ')}`);
  }
  const addonConfig = await db.collection('addonconfigs').findOne({ uuid: 'ff7084d8-904b-42d9-91f5-ea2b4ae37590' });
  console.log('Profiles in AddonConfig:');
  for (const p of (addonConfig?.profiles || [])) {
    console.log(`- id: ${p.id}, name: ${p.name}`);
  }
  await mongoose.disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
