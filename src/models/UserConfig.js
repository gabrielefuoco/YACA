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
            let userId = userData.userId;
            const stremioKey = userData.apiKeys?.stremio;
            const email = userData.email;

            // 1. RECONCILIATION: Check by email first (stable identity)
            // 2. Fallback: Check by stremio key (session identity)
            let existingUser = null;
            if (email) {
                existingUser = await User.findOne({ email }).lean();
            }
            if (!existingUser && stremioKey) {
                existingUser = await User.findOne({ 'apiKeys.stremio': stremioKey }).lean();
            }

            if (existingUser?.userId) {
                userId = existingUser.userId;
            }

            if (!userId) {
                // Genera un ID corto ed elegante (es. "xK9L2p")
                userId = nanoid(10);
            }

            // Anti-overwrite: if user exists and incoming profiles are empty,
            // preserve existing profiles and Trakt tokens from the database.
            if (existingUser) {
                if (!userData.profiles?.length) {
                    if (Array.isArray(existingUser.profiles) && existingUser.profiles.length > 0) {
                        userData.profiles = existingUser.profiles;
                    }
                }
                if (!userData.apiKeys?.trakt && existingUser.apiKeys?.trakt) {
                    userData.apiKeys.trakt = existingUser.apiKeys.trakt;
                }
                if (!userData.apiKeys?.traktRefreshToken && existingUser.apiKeys?.traktRefreshToken) {
                    userData.apiKeys.traktRefreshToken = existingUser.apiKeys.traktRefreshToken;
                }
                // Preserve Stremio Password
                if (!userData.apiKeys?.stremioPass && existingUser.apiKeys?.stremioPass) {
                    userData.apiKeys.stremioPass = existingUser.apiKeys.stremioPass;
                }
                // Preserve Email
                if (!userData.email && existingUser.email) {
                    userData.email = existingUser.email;
                }
            }

            const updatedUser = await User.findOneAndUpdate(
                { userId },
                { ...userData, userId },
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
