require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const TasteProfile = require('../src/models/TasteProfile');

async function run() {
    const args = process.argv.slice(2);
    let targetHandle = null;
    let targetUserId = null;
    let targetAddonUuid = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--handle' && args[i + 1]) {
            targetHandle = args[++i];
        } else if (args[i] === '--userId' && args[i + 1]) {
            targetUserId = args[++i];
        } else if (args[i] === '--addonUuid' && args[i + 1]) {
            targetAddonUuid = args[++i];
        } else if (!args[i].startsWith('--') && !targetHandle && !targetUserId && !targetAddonUuid) {
            // Positional fallback
            const val = args[i];
            if (val.includes('@') || /^[a-zA-Z0-9_-]+$/.test(val)) {
                targetHandle = val;
            } else {
                targetUserId = val;
            }
        }
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB Atlas.");

        let user = null;

        if (targetUserId) {
            user = await UserAccount.findOne({ userId: targetUserId }).lean();
            if (!user) console.log(`No UserAccount found with userId: ${targetUserId}`);
        } else if (targetHandle) {
            user = await UserAccount.findOne({ handle: targetHandle }).lean();
            if (!user) console.log(`No UserAccount found with handle: ${targetHandle}`);
        } else if (targetAddonUuid) {
            user = await UserAccount.findOne({ addonUuid: targetAddonUuid }).lean();
            if (!user) console.log(`No UserAccount found with addonUuid: ${targetAddonUuid}`);
        } else {
            // Default behavior: look for config with otaku preset or first available account
            const configs = await AddonConfig.find().lean();
            let targetConfig = null;
            
            for (const config of configs) {
                const hasOtaku = config.profiles?.some(p => p.presets?.includes('tpl_otaku') || p.presets?.includes('otaku_hardcore'));
                if (hasOtaku) {
                    targetConfig = config;
                    console.log(`Found config with Otaku preset! UUID: ${config.uuid}`);
                    break;
                }
            }

            if (targetConfig) {
                user = await UserAccount.findOne({ addonUuid: targetConfig.uuid }).lean();
            } else {
                user = await UserAccount.findOne().lean();
                if (user) console.log(`Found first UserAccount: ${user.userId}`);
            }
        }

        if (user) {
            console.log(`\n=== User Account ===`);
            console.log(`User ID:     ${user.userId}`);
            console.log(`Handle:      ${user.handle || '(none)'}`);
            console.log(`Addon UUID:  ${user.addonUuid || '(none)'}`);
            console.log(`Created At:  ${user.createdAt || '(unknown)'}`);

            if (user.addonUuid) {
                const config = await AddonConfig.findOne({ uuid: user.addonUuid }).lean();
                if (config) {
                    console.log(`\n=== Addon Configuration ===`);
                    console.log(`Active Profile ID: ${config.activeProfileId || '(none)'}`);
                    console.log(`Profiles (${(config.profiles || []).length}):`);
                    (config.profiles || []).forEach(p => {
                        console.log(`  - [${p.id}] ${p.name || p.id} (${(p.presets || []).length} presets)`);
                    });
                }
            }

            const profile = await TasteProfile.findOne({ owner: user.userId }).lean();
            console.log(`\n=== Taste Profile ===`);
            if (profile) {
                const traktCount = profile.sources?.traktHistory?.length || profile.sources?.traktHistory || 0;
                const vFinalKeys = Object.keys(profile.compiledVectors?.V_final || {}).length;
                console.log(`Watched Items (Trakt): ${traktCount}`);
                console.log(`V_final Unique Keys:   ${vFinalKeys}`);
            } else {
                console.log(`No TasteProfile found for owner: ${user.userId}`);
            }
        }

        const totalUsers = await UserAccount.countDocuments();
        console.log(`\nTotal users in DB: ${totalUsers}`);

    } catch (err) {
        console.error("Error during find_user:", err.message);
    } finally {
        await mongoose.disconnect();
    }
}

run();
