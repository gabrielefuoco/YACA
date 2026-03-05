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
            if (!userId && stremioKey) {
                const existingUser = await User.findOne({ 'apiKeys.stremio': stremioKey }).select('userId').lean();
                if (existingUser?.userId) {
                    userId = existingUser.userId;
                }
            }
            if (!userId) {
                // Genera un ID corto ed elegante (es. "xK9L2p")
                userId = nanoid(10);
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
