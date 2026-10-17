/**
 * src/profile/door.js
 *
 * La porta del modulo profilo (Ticket 21).
 *
 * Possiede:
 * - l'anagrafica (crea, rinomina, duplica, elimina, attiva)
 * - la lista dei profili (`profiliDi`) e il singolo profilo grezzo (`profiloDi`)
 * - l'invariante «almeno uno»: `global` è un profilo vero, l'ultimo non può essere eliminato,
 *   e la risoluzione del profilo attivo collassa le copie di `|| 'global'`.
 */

const { nanoid } = require('nanoid');
const AddonConfig = require('../models/AddonConfig');
const UserAccount = require('../models/UserAccount');

function defaultGlobalProfile() {
    return {
        id: 'global',
        name: 'Generale',
        catalogs: [],
        settings: {
            kidsMode: false,
            typeSelectors: {}
        },
        raw_ui_state: {}
    };
}

/**
 * Risolve in modo centralizzato il profilo attivo eliminando le copie di `|| 'global'`.
 *
 * @param {object} [input]
 * @returns {string} ID del profilo attivo (sempre una stringa valida, mai undefined/null)
 */
function risolviProfiloAttivo(input = {}) {
    if (!input || typeof input !== 'object') return 'global';

    const requested = input.requested || input.requestedProfileId || input.activeProfileId || input.profileId;
    const previous = input.previous;
    const configObj = input.addonConfig?.config || input.config || input.userConfig;
    const activeFromConfig = configObj?.activeProfileId || previous;
    const rawProfiles = input.profiles || input.addonConfig?.profiles || input.userConfig?.profiles || [];
    const profiles = Array.isArray(rawProfiles) ? rawProfiles : [];

    const profileIds = new Set(profiles.map(p => p?.id || p?._id?.toString()).filter(Boolean));

    if (requested && (profileIds.size === 0 || profileIds.has(requested))) {
        return requested;
    }
    if (activeFromConfig && (profileIds.size === 0 || profileIds.has(activeFromConfig))) {
        return activeFromConfig;
    }
    if (profiles.length > 0 && profiles[0]?.id) {
        return profiles[0].id;
    }

    return 'global';
}

/**
 * Restituisce l'addonUuid associato a un utente o pass-through se già fornito.
 * @private
 */
async function resolveAddonUuid(userId, explicitAddonUuid = null) {
    if (explicitAddonUuid) return explicitAddonUuid;
    if (!userId) return null;
    try {
        const account = await UserAccount.findOne({ userId }).lean();
        return account?.addonUuid || null;
    } catch (_e) {
        return null;
    }
}

/**
 * Restituisce la lista di profili per un dato utente.
 * Invariante «almeno uno»: non ritorna mai un array vuoto. Se l'utente non ha profili,
 * garantisce la presenza di `global` ('Generale').
 *
 * @param {string} userId
 * @param {string} [addonUuid]
 * @returns {Promise<Array<object>>}
 */
async function profiliDi(userId, addonUuid = null) {
    const uuid = await resolveAddonUuid(userId, addonUuid);
    if (!uuid) {
        return [defaultGlobalProfile()];
    }

    try {
        const addonConfig = await AddonConfig.findOne({ uuid }).lean();
        const profiles = (addonConfig?.profiles || []).map(p => ({
            ...p,
            id: p.id || p._id?.toString()
        }));

        if (profiles.length === 0) {
            return [defaultGlobalProfile()];
        }
        return profiles;
    } catch (err) {
        return [defaultGlobalProfile()];
    }
}

/**
 * Restituisce il profilo grezzo (raw) per un utente e un profileId.
 * Il profilo non contiene campi derivati o selettori effettivi pre-calcolati.
 *
 * @param {{userId?: string, profileId?: string, addonUuid?: string}} params
 * @returns {Promise<object>}
 */
async function profiloDi({ userId, profileId, addonUuid } = {}) {
    const uuid = await resolveAddonUuid(userId, addonUuid);
    if (!uuid) {
        return defaultGlobalProfile();
    }

    try {
        const addonConfig = await AddonConfig.findOne({ uuid }).lean();
        const profiles = addonConfig?.profiles || [];
        const targetId = profileId || risolviProfiloAttivo({ addonConfig });

        const found = profiles.find(p => (p.id || p._id?.toString()) === targetId);
        if (found) {
            return {
                ...found,
                id: found.id || found._id?.toString()
            };
        }

        // Se non trovato per ID, prendi il primo o fallback a global
        if (profiles.length > 0) {
            const first = profiles[0];
            return {
                ...first,
                id: first.id || first._id?.toString()
            };
        }

        return defaultGlobalProfile();
    } catch (err) {
        return defaultGlobalProfile();
    }
}

/**
 * Comando: Crea un nuovo profilo nell'AddonConfig dell'utente.
 */
async function creaProfilo({ userId, profileData = {}, addonUuid = null } = {}) {
    const uuid = await resolveAddonUuid(userId, addonUuid);
    if (!uuid) throw new Error('Account utente non trovato per la creazione del profilo.');

    const newProfile = {
        id: profileData.id || nanoid(8),
        name: profileData.name || 'Nuovo Profilo',
        catalogs: Array.isArray(profileData.catalogs) ? profileData.catalogs : [],
        settings: { ...(profileData.settings || {}) },
        raw_ui_state: { ...(profileData.raw_ui_state || {}) }
    };

    await AddonConfig.updateOne(
        { uuid },
        { $push: { profiles: newProfile } },
        { upsert: true }
    );

    return newProfile;
}

/**
 * Comando: Rinomina un profilo.
 */
async function rinominaProfilo({ userId, profileId, name, addonUuid = null } = {}) {
    const uuid = await resolveAddonUuid(userId, addonUuid);
    if (!uuid) throw new Error('Account utente non trovato.');
    if (!profileId || !name) throw new Error('profileId e name sono obbligatori.');

    await AddonConfig.updateOne(
        { uuid, 'profiles.id': profileId },
        { $set: { 'profiles.$.name': name } }
    );
    return { success: true, profileId, name };
}

/**
 * Comando: Duplica un profilo esistente.
 */
async function duplicaProfilo({ userId, profileId, newName, addonUuid = null } = {}) {
    const original = await profiloDi({ userId, profileId, addonUuid });
    const uuid = await resolveAddonUuid(userId, addonUuid);

    const duplicated = {
        ...original,
        id: nanoid(8),
        name: newName || `${original.name || 'Profilo'} (Copia)`
    };

    await AddonConfig.updateOne(
        { uuid },
        { $push: { profiles: duplicated } }
    );

    return duplicated;
}

/**
 * Comando: Elimina un profilo.
 * Invariante «almeno uno»: rifiuta l'eliminazione se è l'ultimo profilo rimasto.
 */
async function eliminaProfilo({ userId, profileId, addonUuid = null } = {}) {
    const uuid = await resolveAddonUuid(userId, addonUuid);
    if (!uuid) throw new Error('Account utente non trovato.');

    const addonConfig = await AddonConfig.findOne({ uuid });
    const profiles = addonConfig?.profiles || [];

    if (profiles.length <= 1) {
        throw new Error('Impossibile eliminare l\'ultimo profilo rimanente: deve esistere almeno un profilo.');
    }

    const remaining = profiles.filter(p => (p.id || p._id?.toString()) !== profileId);

    // Se stiamo eliminando il profilo attivo, imposta il primo rimanente come attivo
    const updateOps = {
        $pull: { profiles: { id: profileId } }
    };

    if (addonConfig.config?.activeProfileId === profileId) {
        const nextActiveId = remaining[0]?.id || 'global';
        updateOps.$set = { 'config.activeProfileId': nextActiveId };
    }

    await AddonConfig.updateOne({ uuid }, updateOps);
    return { success: true, deletedProfileId: profileId };
}

/**
 * Comando: Attiva un profilo per l'utente.
 */
async function attivaProfilo({ userId, profileId, addonUuid = null } = {}) {
    const uuid = await resolveAddonUuid(userId, addonUuid);
    if (!uuid) throw new Error('Account utente non trovato.');

    await AddonConfig.updateOne(
        { uuid },
        { $set: { 'config.activeProfileId': profileId } }
    );
    return { success: true, activeProfileId: profileId };
}

module.exports = {
    defaultGlobalProfile,
    risolviProfiloAttivo,
    resolveActiveProfileId: risolviProfiloAttivo,
    profiliDi,
    profiloDi,
    creaProfilo,
    rinominaProfilo,
    duplicaProfilo,
    eliminaProfilo,
    attivaProfilo
};
