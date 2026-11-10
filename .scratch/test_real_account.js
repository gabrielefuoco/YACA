require('dotenv').config();
const mongoose = require('mongoose');
const { connectMongo } = require('../src/infra/mongoConnect');
const UserConfig = require('../src/models/UserConfig');
const { resolveProfileShelves } = require('../src/stremio/shelvesResolver');
const { buildManifest } = require('../src/stremio/manifest');
const { setCachedProfileShelves, getCachedProfileShelves, clearCachedProfileShelves } = require('../src/pool');

async function test() {
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const userConfig = await UserConfig.resolveUserConfig('ff7084d8-904b-42d9-91f5-ea2b4ae37590');
    console.log('User config resolved for:', userConfig.userId, 'Active modo:', userConfig.config?.activeModo);

    // Test cold cache: no cached shelves
    clearCachedProfileShelves();
    console.log('\n--- Resolving with cold cache ---');
    const coldShelves = await resolveProfileShelves({ userConfig });
    console.log('Cold resolved shelves count:', coldShelves.length);
    console.log('Cold resolved shelves:', coldShelves.map(s => ({ id: s.catalog_id || s.id, medium: s.medium, slot: s.slot, nome: s.nome })));

    const coldManifest = buildManifest(userConfig, 'http://localhost:7000', 'ff7084d8-904b-42d9-91f5-ea2b4ae37590', { shelves: coldShelves });
    console.log('Cold manifest dynamic shelf catalogs:', coldManifest.catalogs.filter(c => c.id.startsWith('yaca_') && !c.id.startsWith('yaca_search_') && !c.id.startsWith('yaca_watchlist_')).map(c => ({ id: c.id, type: c.type, name: c.name })));

    await mongoose.disconnect();
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
