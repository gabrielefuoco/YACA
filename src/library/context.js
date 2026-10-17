/**
 * src/library/context.js
 *
 * Resolver unico del contesto libreria (Ticket 16, Emendamento 3).
 *
 * Il contesto della libreria è tre chiavi:
 * - userId: proprietario dell'account
 * - profileId: contesto del profilo (es. 'global' o id del profilo) per WatchHistory
 * - addonUuid: identificatore dell'installazione per UserLibraryItem e AddonConfig
 *
 * Isola l'accesso a UserAccount e AddonConfig per la risoluzione del contesto:
 * UserAccount e AddonConfig non devono comparire sparsi dentro le query del modulo.
 */

const UserAccount = require('../db/models/UserAccount');

/**
 * Risolve le tre chiavi del contesto di libreria: { userId, profileId, addonUuid }.
 *
 * @param {{userId?: string|null, profileId?: string|null, addonUuid?: string|null, user?: object|null}} input
 * @returns {Promise<{userId: string|null, profileId: string, addonUuid: string|null}>}
 */
async function resolveLibraryContext(input = {}) {
    const { userId, profileId, addonUuid, user } = input || {};
    let resolvedUserId = userId || user?.userId || null;
    let resolvedAddonUuid = addonUuid || user?.addonUuid || null;
    const resolvedProfileId = (profileId && String(profileId).trim()) || 'global';

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

    return {
        userId: resolvedUserId,
        profileId: resolvedProfileId,
        addonUuid: resolvedAddonUuid
    };
}

module.exports = {
    resolveLibraryContext,
    risolviContestoLibreria: resolveLibraryContext
};
