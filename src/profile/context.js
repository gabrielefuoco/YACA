/**
 * src/profile/context.js
 *
 * Resolver del contesto unico del profilo (Ticket 21).
 *
 * Produce l'oggetto di contesto che scende a tutti i consumatori:
 * { userId, profileId, addonUuid, selettoriEffettivi, kidsMode, slider }
 *
 * Risolve i selettori al bordo della richiesta in modo che pool, catalogHandler
 * e cache ricevano la medesima istanza senza divergenze per costruzione.
 */

const UserAccount = require('../db/models/UserAccount');
const { profiloDi, risolviProfiloAttivo } = require('./door');
const { selettoriEffettivi } = require('./selettoriEffettivi');

/**
 * Risolve il contesto completo del profilo.
 *
 * @param {{
 *   userId?: string|null,
 *   profileId?: string|null,
 *   addonUuid?: string|null,
 *   richiesta?: object|null,
 *   user?: object|null
 * }} input
 * @returns {Promise<{
 *   userId: string|null,
 *   profileId: string,
 *   addonUuid: string|null,
 *   selettoriEffettivi: object,
 *   kidsMode: boolean,
 *   slider: object
 * }>}
 */
async function contestoDi(input = {}) {
    const { userId, profileId, addonUuid, richiesta, user } = input || {};

    let resolvedUserId = userId || user?.userId || null;
    let resolvedAddonUuid = addonUuid || user?.addonUuid || null;

    if (!resolvedAddonUuid && resolvedUserId) {
        try {
            const account = await UserAccount.findOne({ userId: resolvedUserId }).lean();
            if (account?.addonUuid) {
                resolvedAddonUuid = account.addonUuid;
            }
        } catch (_err) {}
    } else if (!resolvedUserId && resolvedAddonUuid) {
        try {
            const account = await UserAccount.findOne({ addonUuid: resolvedAddonUuid }).lean();
            if (account?.userId) {
                resolvedUserId = account.userId;
            }
        } catch (_err) {}
    }

    // Lettura del profilo grezzo
    const rawProfile = await profiloDi({
        userId: resolvedUserId,
        profileId: profileId || undefined,
        addonUuid: resolvedAddonUuid
    });

    const resolvedProfileId = (profileId && String(profileId).trim())
        || rawProfile?.id
        || 'global';

    // Calcolo kidsMode (la richiesta specifica sovrascrive il profilo)
    const kidsMode = Boolean(
        richiesta?.kidsMode !== undefined ? richiesta.kidsMode :
        richiesta?.isKidsMode !== undefined ? richiesta.isKidsMode :
        rawProfile?.settings?.kidsMode
    );

    // Calcolo slider Ocean (preferenze motore salvate nel profilo)
    const slider = rawProfile?.settings?.slider
        || rawProfile?.settings?.oceanSliders
        || rawProfile?.settings?.sliders
        || {};

    // Calcolo dei selettori effettivi tramite funzione pura del modulo
    const resolvedSelectors = selettoriEffettivi(rawProfile, {
        ...(richiesta || {}),
        kidsMode
    });

    return {
        userId: resolvedUserId,
        profileId: resolvedProfileId,
        addonUuid: resolvedAddonUuid,
        selettoriEffettivi: resolvedSelectors,
        kidsMode,
        slider
    };
}

module.exports = {
    contestoDi,
    risolviContesto: contestoDi
};
