/**
 * UserConfig Manager: Gestisce il caricamento e il salvataggio delle configurazioni utente.
 * Supporta il modello stateful (MongoDB via userId) con riconciliazione sicura.
 *
 * REGOLE:
 * - VIETATE le mutazioni distruttive: mai sovrascrivere campi validi con null/undefined/stringa vuota.
 * - Riconciliazione con ordine gerarchico stretto: userId → email → stremioAuthHash.
 * - L'hash SHA-256 dell'authKey Stremio (stremioAuthHash) è usato per lookup sicuro.
 */

const { nanoid } = require('nanoid');
const User = require('../db/models/User');
const { hashValue } = require('../db/models/User');

/**
 * Verifica se un valore è una stringa non-vuota valida.
 * Usato per prevenire sovrascritture distruttive.
 */
function isValidString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

const UserConfig = {
    /**
     * Carica un utente dal database MongoDB tramite il suo ID corto.
     * @param {string} userId - ID univoco dell'utente
     * @returns {Promise<object|null>} Il documento utente o null
     */
    async getUser(userId) {
        try {
            return await User.findOne({ userId });
        } catch (err) {
            console.error(`Errore caricamento utente ${userId}:`, err.message);
            return null;
        }
    },

    /**
     * Salva o aggiorna un utente nel database con riconciliazione sicura.
     * Se userData.userId non esiste, ne genera uno nuovo.
     *
     * Riconciliazione gerarchica:
     *   1. userId (se fornito, lookup diretto)
     *   2. email (se fornita e non trovato via userId)
     *   3. stremioAuthHash (hash dell'authKey Stremio)
     *
     * Regola anti-sovrascrittura: i campi stringa preesistenti non vengono mai sovrascritti
     * da valori null, undefined o stringa vuota provenienti da payload parziali.
     *
     * @param {object} userData - Dati dell'utente
     * @returns {Promise<{user: object, isNewUser: boolean}>} Il documento salvato e flag nuovo utente
     */
    async saveUser(userData) {
        try {
            const stremioKey = userData.apiKeys?.stremio;
            const email = userData.email;
            let targetUserId = userData.userId;

            // 1. RECONCILIATION: Ordine gerarchico stretto (userId → email → stremioAuthHash)
            let existingUser = null;

            // Step 1a: Lookup per userId (priorità massima)
            if (targetUserId) {
                existingUser = await User.findOne({ userId: targetUserId });
            }

            // Step 1b: Lookup per email (se non trovato via userId)
            if (!existingUser && isValidString(email)) {
                existingUser = await User.findOne({ email });
            }

            // Step 1c: Lookup per stremioAuthHash (se non trovato via email)
            if (!existingUser && isValidString(stremioKey)) {
                const hash = hashValue(stremioKey);
                if (hash) {
                    existingUser = await User.findOne({ stremioAuthHash: hash });
                }
            }

            const isNewUser = !existingUser;

            // Se abbiamo trovato un utente esistente, DOBBIAMO usare il suo ID
            if (existingUser) {
                targetUserId = existingUser.userId;
            }

            // Se ancora nessun userId, generiamo uno nuovo
            if (!targetUserId) {
                targetUserId = nanoid(10);
            }

            // 2. DATA PRESERVATION & MERGING (Anti-sovrascrittura)
            if (existingUser) {
                // Preserve profiles if incoming are empty
                if (!userData.profiles?.length && existingUser.profiles?.length) {
                    userData.profiles = existingUser.profiles;
                } else if (Array.isArray(userData.profiles) && existingUser.profiles?.length) {
                    const existingProfiles = new Map(
                        existingUser.profiles.map((profile) => [profile.id, profile.toObject?.() || profile])
                    );
                    userData.profiles = userData.profiles.map((profile) => {
                        const existingProfile = existingProfiles.get(profile.id);
                        const existingPending = existingProfile?.settings?.pendingDNASuggestions;
                        if (!existingPending || existingPending.length === 0 || profile?.settings?.pendingDNASuggestions !== undefined) {
                            return profile;
                        }
                        return {
                            ...profile,
                            settings: {
                                ...(profile.settings || {}),
                                pendingDNASuggestions: existingPending.map((item) => ({ ...item }))
                            }
                        };
                    });
                }

                // Merge API Keys: SAFE merge — mai sovrascrivere valori validi con null/vuoto
                const existingApiKeys = existingUser.apiKeys?.toObject?.() || existingUser.apiKeys || {};
                const incomingApiKeys = userData.apiKeys || {};
                const mergedApiKeys = { ...existingApiKeys };

                const apiKeyFields = ['tmdb', 'trakt', 'traktRefreshToken', 'mistral', 'mdblist', 'stremio', 'stremioPass'];
                for (const field of apiKeyFields) {
                    if (isValidString(incomingApiKeys[field])) {
                        // Il valore incoming è valido → usa quello
                        mergedApiKeys[field] = incomingApiKeys[field];
                    }
                    // Se incoming è null/undefined/vuoto, mantieni il valore esistente (già nel merge base)
                }

                userData.apiKeys = mergedApiKeys;

                // Preserve Email: non sovrascrivere email valida con null/vuoto
                if (!isValidString(userData.email) && isValidString(existingUser.email)) {
                    userData.email = existingUser.email;
                }

                // Preserve Config: merge conservativo
                userData.config = {
                    ...existingUser.config?.toObject?.() || existingUser.config,
                    ...userData.config
                };
            }

            // Ensure userId is the one we decided on
            userData.userId = targetUserId;

            // Calcola stremioAuthHash per lookup sicuro
            const finalStremioKey = userData.apiKeys?.stremio;
            if (isValidString(finalStremioKey)) {
                userData.stremioAuthHash = hashValue(finalStremioKey);
            }

            // 3. FINAL SAVE
            const updatedUser = await User.findOneAndUpdate(
                { userId: targetUserId },
                { $set: userData },
                { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
            );
            return { user: updatedUser, isNewUser };
        } catch (err) {
            console.error(`Errore salvataggio utente:`, err.message);
            throw err;
        }
    }
};

module.exports = UserConfig;
