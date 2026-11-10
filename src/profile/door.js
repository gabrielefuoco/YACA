/**
 * src/profile/door.js
 *
 * La porta del modulo profilo (Ticket 21 & Ticket 26).
 *
 * Possiede:
 * - l'anagrafica (crea, rinomina, duplica, elimina, attiva)
 * - la lista dei profili (`profiliDi`) e il singolo profilo grezzo (`profiloDi`)
 * - l'invariante «almeno uno»: `global` è un profilo vero, l'ultimo non può essere eliminato,
 *   e la risoluzione del profilo attivo collassa le copie di `|| 'global'`.
 * - lo stato UI del profilo (`leggiUiState`, `salvaUiState`, `selectedPresetsDi`) (Ticket 26, Decisione 2)
 */

const { nanoid } = require('nanoid');
const AddonConfig = require('../models/AddonConfig');
const ProfileUiState = require('./models/ProfileUiState');
const { accountDi } = require('../configurazione');
const {
    modiAbilitati,
    leggiModoAttivo,
    profiloDelModo
} = require('./modo');

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
 * Con `MODI_ABILITATI` acceso il profilo attivo è la casella della modalità
 * attiva: la modalità vince su `requested`/`previous`, perché è l'unica fonte
 * di verità del ticket 01. Se la casella non esiste ancora (documento legacy,
 * migrazione non eseguita) si ricade sulla risoluzione storica, senza inventare
 * un profilo.
 *
 * @param {object} [input]
 * @returns {string} ID del profilo attivo (sempre una stringa valida, mai undefined/null)
 */
function risolviProfiloAttivo(input = {}) {
    if (!input || typeof input !== 'object') return 'global';

    if (modiAbilitati()) {
        const documento = input.addonConfig || input.userConfig || input;
        const profiloModo = profiloDelModo(documento, leggiModoAttivo(documento));
        if (profiloModo && profiloModo.id !== undefined && profiloModo.id !== null && String(profiloModo.id).trim()) {
            return String(profiloModo.id);
        }
    }

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
        const account = await accountDi(userId);
        return account?.addonUuid || null;
    } catch (_e) {
        return null;
    }
}

/**
 * Legge lo stato della UI per un dato profilo (Ticket 26, Decisione 2).
 * Modello dedicato `ProfileUiState` con fallback di lettura su `raw_ui_state` in AddonConfig.
 *
 * @param {Object} params
 * @param {string} params.addonUuid
 * @param {string} [params.profileId='global']
 * @param {Object} [params.fallbackProfile=null]
 * @returns {Promise<{selectedPresets: string[], catalogOrder: string[], newPrompts: any[], heroPresetsInitialized: boolean}>}
 */
async function leggiUiState({ addonUuid, profileId = 'global', fallbackProfile = null } = {}) {
    const defaultState = {
        selectedPresets: [],
        catalogOrder: [],
        newPrompts: [],
        heroPresetsInitialized: false
    };

    if (!addonUuid && !fallbackProfile) {
        return defaultState;
    }

    try {
        // 1. Lettura dal modello proprietario del profilo
        if (addonUuid && ProfileUiState && typeof ProfileUiState.findOne === 'function') {
            const doc = await ProfileUiState.findOne({ addonUuid, profileId }).lean();
            if (doc) {
                return {
                    selectedPresets: Array.isArray(doc.selectedPresets) ? doc.selectedPresets : [],
                    catalogOrder: Array.isArray(doc.catalogOrder) ? doc.catalogOrder : [],
                    newPrompts: Array.isArray(doc.newPrompts) ? doc.newPrompts : [],
                    heroPresetsInitialized: Boolean(doc.heroPresetsInitialized)
                };
            }
        }

        // 2. Fallback da fallbackProfile passato
        const rawUi = fallbackProfile?.raw_ui_state || fallbackProfile?.uiState;
        if (rawUi && typeof rawUi === 'object') {
            return {
                selectedPresets: Array.isArray(rawUi.selectedPresets) ? rawUi.selectedPresets : [],
                catalogOrder: Array.isArray(rawUi.catalogOrder) ? rawUi.catalogOrder : [],
                newPrompts: Array.isArray(rawUi.newPrompts) ? rawUi.newPrompts : [],
                heroPresetsInitialized: Boolean(rawUi.heroPresetsInitialized)
            };
        }

        // 3. Fallback per scansione da AddonConfig
        if (addonUuid && AddonConfig && typeof AddonConfig.findOne === 'function') {
            const config = await AddonConfig.findOne({ uuid: addonUuid }).lean();
            const prof = (config?.profiles || []).find(p => (p.id || p._id?.toString()) === profileId)
                || (profileId === 'global' ? config?.profiles?.[0] : null);
            if (prof?.raw_ui_state) {
                return {
                    selectedPresets: Array.isArray(prof.raw_ui_state.selectedPresets) ? prof.raw_ui_state.selectedPresets : [],
                    catalogOrder: Array.isArray(prof.raw_ui_state.catalogOrder) ? prof.raw_ui_state.catalogOrder : [],
                    newPrompts: Array.isArray(prof.raw_ui_state.newPrompts) ? prof.raw_ui_state.newPrompts : [],
                    heroPresetsInitialized: Boolean(prof.raw_ui_state.heroPresetsInitialized)
                };
            }
        }

        return defaultState;
    } catch (_err) {
        return defaultState;
    }
}

/**
 * Salva lo stato UI nel modello ProfileUiState con mirroring transizionale (Ticket 26, Decisione 2).
 *
 * @param {Object} params
 * @param {string} params.addonUuid
 * @param {string} [params.profileId='global']
 * @param {Object} params.uiState
 * @returns {Promise<Object>}
 */
async function salvaUiState({ addonUuid, profileId = 'global', uiState = {} } = {}) {
    if (!addonUuid) throw new Error('addonUuid obbligatorio per salvare uiState.');

    const cleanUiState = {
        selectedPresets: Array.isArray(uiState.selectedPresets) ? [...new Set(uiState.selectedPresets)] : [],
        catalogOrder: Array.isArray(uiState.catalogOrder) ? [...new Set(uiState.catalogOrder)] : [],
        newPrompts: Array.isArray(uiState.newPrompts) ? uiState.newPrompts : [],
        heroPresetsInitialized: Boolean(uiState.heroPresetsInitialized)
    };

    if (ProfileUiState && typeof ProfileUiState.updateOne === 'function') {
        await ProfileUiState.updateOne(
            { addonUuid, profileId },
            { $set: cleanUiState },
            { upsert: true }
        );
    }

    // Mirroring transizionale su AddonConfig
    try {
        if (AddonConfig && typeof AddonConfig.updateOne === 'function') {
            await AddonConfig.updateOne(
                { uuid: addonUuid, 'profiles.id': profileId },
                { $set: { 'profiles.$.raw_ui_state': cleanUiState } }
            );
        }
    } catch (_err) {}

    return cleanUiState;
}

/**
 * Helper sincrono/puro per estrarre selectedPresets da un oggetto profilo (Decisione 2).
 * Utilizzato da buildManifest e fingerprint per non leggere direttamente raw_ui_state.
 *
 * @param {Object} profile
 * @returns {string[]}
 */
function selectedPresetsDi(profile) {
    if (!profile) return [];
    if (profile.uiState?.selectedPresets && Array.isArray(profile.uiState.selectedPresets)) {
        return profile.uiState.selectedPresets;
    }
    if (profile.raw_ui_state?.selectedPresets && Array.isArray(profile.raw_ui_state.selectedPresets)) {
        return profile.raw_ui_state.selectedPresets;
    }
    return [];
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
            const vista = {
                ...found,
                id: found.id || found._id?.toString()
            };
            // Con il flag acceso il profilo restituito È la modalità attiva: il
            // campo `modo` calcolato qui evita che ogni consumatore rilegga il
            // documento per derivare le leve. Senza flag non si tocca niente.
            if (modiAbilitati()) {
                vista.modo = leggiModoAttivo(addonConfig);
            }
            return vista;
        }

        // Se non trovato per ID, prendi il primo o fallback a global
        if (profiles.length > 0) {
            const first = profiles[0];
            const vista = {
                ...first,
                id: first.id || first._id?.toString()
            };
            if (modiAbilitati()) vista.modo = leggiModoAttivo(addonConfig);
            return vista;
        }

        return defaultGlobalProfile();
    } catch (err) {
        return defaultGlobalProfile();
    }
}

module.exports = {
    defaultGlobalProfile,
    risolviProfiloAttivo,
    resolveActiveProfileId: risolviProfiloAttivo,
    leggiUiState,
    salvaUiState,
    selectedPresetsDi,
    profiliDi,
    profiloDi
};
