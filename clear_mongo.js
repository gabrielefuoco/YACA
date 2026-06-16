const mongoose = require('mongoose');

async function run() {
  const uri = "mongodb+srv://Gabriele29:Valetta.012@atlascluster.dtgloub.mongodb.net/yaca?appName=AtlasCluster";
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");
  
  const db = mongoose.connection.db;
  
  try {
    const result1 = await db.collection('cacheentries').deleteMany({});
    console.log("Deleted documents from cacheentries:", result1.deletedCount);
  } catch(e) {
    console.error("Error clearing cacheentries:", e.message);
  }
  
  try {
    const result2 = await db.collection('tmdbrequestcaches').deleteMany({});
    console.log("Deleted documents from tmdbrequestcaches:", result2.deletedCount);
  } catch(e) {
    console.error("Error clearing tmdbrequestcaches:", e.message);
  }
  
  await mongoose.disconnect();
  console.log("Done");
}

run().catch(console.error);
