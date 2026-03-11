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
            const stremioKey = userData.apiKeys?.stremio;
            const email = userData.email;
            let targetUserId = userData.userId;

            // 1. RECONCILIATION: Find existing user
            let existingUser = null;
            if (email) {
                existingUser = await User.findOne({ email });
            }
            if (!existingUser && stremioKey) {
                existingUser = await User.findOne({ 'apiKeys.stremio': stremioKey });
            }

            // If we found an existing user, we MUST use their ID
            if (existingUser) {
                targetUserId = existingUser.userId;
            }

            // If still no userId, generate a new one
            if (!targetUserId) {
                targetUserId = nanoid(10);
            }

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

                // Merge API Keys: preserve existing if incoming are null/missing
                const mergedApiKeys = {
                    ...existingUser.apiKeys?.toObject?.() || existingUser.apiKeys,
                    ...userData.apiKeys
                };

                // Specific check for Trakt: if incoming is missing, preserve existing
                if (!userData.apiKeys?.trakt && existingUser.apiKeys?.trakt) {
                    mergedApiKeys.trakt = existingUser.apiKeys.trakt;
                }
                if (!userData.apiKeys?.traktRefreshToken && existingUser.apiKeys?.traktRefreshToken) {
                    mergedApiKeys.traktRefreshToken = existingUser.apiKeys.traktRefreshToken;
                }
                if (!userData.apiKeys?.stremioPass && existingUser.apiKeys?.stremioPass) {
                    mergedApiKeys.stremioPass = existingUser.apiKeys.stremioPass;
                }
                if (!userData.apiKeys?.mistral && existingUser.apiKeys?.mistral) {
                    mergedApiKeys.mistral = existingUser.apiKeys.mistral;
                }
                if (!userData.apiKeys?.tmdb && existingUser.apiKeys?.tmdb) {
                    mergedApiKeys.tmdb = existingUser.apiKeys.tmdb;
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
            const updatedUser = await User.findOneAndUpdate(
                { userId: targetUserId },
                { $set: userData },
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
