/**
 * UserConfig Manager: Gestisce il caricamento e il salvataggio delle configurazioni utente.
 * Supporta sia il nuovo modello stateful (MongoDB via userId) che il vecchio stateless (Base64).
 */

const { nanoid } = require('nanoid');
const User = require('../db/models/User');

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
     * Salva o aggiorna un utente nel database.
     * Se userData.userId non esiste, ne genera uno nuovo.
     * @param {object} userData - Dati dell'utente
     * @returns {Promise<object>} Il documento salvato
     */
    async saveUser(userData) {
        try {
            let targetUserId = userData.userId;

            // If still no userId, generate a new one
            if (!targetUserId) {
                targetUserId = nanoid(10);
            }

            const existingUser = await User.findOne({ userId: targetUserId });

            // 2. DATA PRESERVATION & MERGING
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

                // Merge API Keys: preserve existing only when incoming keys are undefined
                const incomingApiKeys = userData.apiKeys || {};
                const mergedApiKeys = {
                    ...existingUser.apiKeys?.toObject?.() || existingUser.apiKeys,
                    ...incomingApiKeys
                };

                const apiKeyFields = new Set([
                    ...Object.keys(existingUser.apiKeys?.toObject?.() || existingUser.apiKeys || {}),
                    ...Object.keys(incomingApiKeys)
                ]);
                for (const key of apiKeyFields) {
                    if (!(key in incomingApiKeys) || incomingApiKeys[key] === undefined) {
                        mergedApiKeys[key] = existingUser.apiKeys?.[key];
                        continue;
                    }
                    if (incomingApiKeys[key] === null || incomingApiKeys[key] === '') {
                        mergedApiKeys[key] = null;
                    }
                }

                userData.apiKeys = mergedApiKeys;

                // Preserve Email
                if (!userData.email && existingUser.email) {
                    userData.email = existingUser.email;
                }

                // Preserve Config
                userData.config = {
                    ...existingUser.config?.toObject?.() || existingUser.config,
                    ...userData.config
                };
            }

            // Ensure userId is the one we decided on
            userData.userId = targetUserId;

            // 3. FINAL SAVE
            // We use findOneAndUpdate with the stable targetUserId
            const updateOperation = { $set: userData };
            if (userData.apiKeys && typeof userData.apiKeys === 'object') {
                const unsetApiKeys = Object.entries(userData.apiKeys)
                    .filter(([, value]) => value === null || value === '')
                    .reduce((acc, [key]) => {
                        acc[`apiKeys.${key}`] = 1;
                        return acc;
                    }, {});
                if (Object.keys(unsetApiKeys).length > 0) {
                    updateOperation.$unset = unsetApiKeys;
                }
            }

            const updatedUser = await User.findOneAndUpdate(
                { userId: targetUserId },
                updateOperation,
                { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
            );
            return updatedUser;
        } catch (err) {
            console.error(`Errore salvataggio utente:`, err.message);
            throw err;
        }
    }
};

module.exports = UserConfig;
