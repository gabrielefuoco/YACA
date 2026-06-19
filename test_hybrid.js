require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('./src/db/models/UserAccount');
const AddonConfig = require('./src/db/models/AddonConfig');
const { getEngineHybridCatalog } = require('./src/catalog/providers/HybridProvider');

async function testHybrid() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Troviamo il config dell'utente
    const account = await UserAccount.findOne({ 'trakt.username': 'gabrielefuoco' }).lean(); // o un utente fittizio se non c'è
    if (!account) {
        console.log("Nessun utente");
        return;
    }
    
    const config = await AddonConfig.findOne({ uuid: account.addonUuid }).lean();
    console.log("Profiles:", config.profiles.map(p => p.name));
    
    // Se ha un profilo anime
    const animeProfile = config.profiles.find(p => p.name.toLowerCase().includes('anime'));
    if (animeProfile) {
        console.log("\nAnime Profile Catalogs:", animeProfile.catalogs.map(c => c.id));
        
        // Simulo userConfig
        const userConfig = {
            userId: account.userId,
            apiKeys: { trakt: account.trakt?.accessToken },
            activeProfileId: animeProfile.id,
            config: { hideWatched: false },
            profiles: config.profiles
        };
        
        console.log("\n--- Hybrid: True Blend ---");
        const results = await getEngineHybridCatalog('yaca_true_blend_series', 'series', 0, userConfig, process.env.TMDB_API_KEY);
        results.forEach((r, i) => console.log(`${i+1}. ${r.name} (${r.type})`));
    }
    
    await mongoose.disconnect();
}
testHybrid();
