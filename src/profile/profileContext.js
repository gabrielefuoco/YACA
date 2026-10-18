/**
 * src/profile/profileContext.js
 *
 * Estrazione del contesto di fatto del profilo utente (TasteProfile, AddonConfig, Account) (Ticket 41 - Fetta 1).
 * Spostato da src/engines/hybrid/dataFetchers.js nel modulo src/profile.
 */

const TasteProfile = require('../models/TasteProfile');
const AddonConfig = require('../models/AddonConfig');
const { accountDi } = require('../configurazione');

/**
 * Carica in un punto unico il contesto del profilo e le impostazioni dell'utente.
 *
 * @param {string} userId ID univoco dell'utente
 * @param {string} context ID del profilo attivo (es. 'global')
 * @returns {Promise<{profile: Object|null, user: Object|null, globalProfile: Object|null}>}
 */
async function fetchProfileContext(userId, context) {
    const account = await accountDi(userId);
    const addonConfig = account?.addonUuid
        ? await AddonConfig.findOne({ uuid: account.addonUuid }).lean()
        : null;

    const [profile, globalProfile] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        context === 'global' ? Promise.resolve(null) : TasteProfile.findOne({ owner: userId, context: 'global' })
    ]);

    let user = null;
    if (addonConfig) {
        user = { ...addonConfig, userId, apiKeys: account?.apiKeys || {}, traktStatus: account?.traktStatus || null };
    } else if (account?.apiKeys) {
        user = { profiles: [], userId, apiKeys: account.apiKeys, traktStatus: account?.traktStatus || null };
    }

    return { profile, user, globalProfile };
}

async function getTasteProfile(owner, context) {
    try {
        return await TasteProfile.findOne({ owner, context });
    } catch (_e) {
        return null;
    }
}

module.exports = {
    fetchProfileContext,
    getTasteProfile
};
