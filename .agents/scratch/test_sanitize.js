require('dotenv').config({ path: 'secrets.env' });
const mongoose = require('mongoose');
const { sanitizeCatalogMeta } = require('../../src/catalog/formatters/StremioFormatter');
const UserAccount = require('../../src/db/models/UserAccount');
const AddonConfig = require('../../src/db/models/AddonConfig');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    const targetUser = await UserAccount.findOne({});
    let userConfig = null;
    if (targetUser.addonUuid) {
        userConfig = await AddonConfig.findOne({ uuid: targetUser.addonUuid }).lean();
    }
    
    let meta = {
        id: 'tt0252985',
        tmdbId: 50531,
        type: 'movie',
        name: 'Chiedimi se sono felice',
        poster: 'https://image.tmdb.org/t/p/w500/7DtDnWwmZAI3dYUKNPsRy24SxV3.jpg',
        posterShape: 'poster',
        _itaBadge: true
    };
    
    const sanitizeOptions = {
        userConfig: userConfig,
        hostUrl: 'https://gabriele-fuoco-yaca.hf.space',
        shouldApplyEpisodeBadge: false
    };

    const out = sanitizeCatalogMeta(meta, sanitizeOptions);
    console.log('Resulting Poster:', out.poster);
    
    console.log('userConfig activeProfile:', userConfig?.profiles?.find(p => p.id === userConfig.activeProfileId));
    console.log('process.env.ERDB_CONFIG:', process.env.ERDB_CONFIG);

    await mongoose.disconnect();
}
test();
