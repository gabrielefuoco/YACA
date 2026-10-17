/**
 * src/library/context.js
 *
 * Porta di adattamento per il contesto libreria (Ticket 16 & Ticket 21).
 * Il contesto della libreria è tre chiavi: { userId, profileId, addonUuid }.
 * Delega al modulo profilo (`contestoDi`), che possiede il contesto unico.
 */

const { contestoDi } = require('../profile');

/**
 * Risolve le tre chiavi del contesto di libreria: { userId, profileId, addonUuid }.
 *
 * @param {{userId?: string|null, profileId?: string|null, addonUuid?: string|null, user?: object|null}} input
 * @returns {Promise<{userId: string|null, profileId: string, addonUuid: string|null}>}
 */
async function resolveLibraryContext(input = {}) {
    const ctx = await contestoDi(input);
    return {
        userId: ctx.userId,
        profileId: ctx.profileId,
        addonUuid: ctx.addonUuid
    };
}

module.exports = {
    resolveLibraryContext,
    risolviContestoLibreria: resolveLibraryContext
};
