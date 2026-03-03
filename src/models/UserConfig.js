/**
 * UserConfig Manager: Gestisce il caricamento e il salvataggio delle configurazioni utente.
 * Supporta sia il nuovo modello stateful (MongoDB via userId) che il vecchio stateless (Base64).
 */

const zlib = require('zlib');
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
            if (!userId) {
                // Genera un ID corto ed elegante (es. "xK9L2p")
                userId = nanoid(10);
            }

            const updatedUser = await User.findOneAndUpdate(
                { userId },
                { ...userData, userId },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
            return updatedUser;
        } catch (err) {
            console.error(`Errore salvataggio utente:`, err.message);
            throw err;
        }
    },

    /**
     * Decodifica una stringa Base64 URL-safe in un oggetto di configurazione (Stateless).
     * @param {string} base64Str - Stringa Base64 URL-safe
     * @returns {object|null} L'oggetto configurazione, o null se non valido
     */
    decodeConfig(base64Str) {
        try {
            let json;
            if (base64Str.startsWith('c1')) {
                const buffer = Buffer.from(base64Str.slice(2), 'base64url');
                json = zlib.inflateSync(buffer).toString('utf8');
            } else {
                json = Buffer.from(base64Str, 'base64url').toString('utf8');
            }
            const config = JSON.parse(json);
            if (!config || typeof config !== 'object' || !config.apiKeys) return null;
            return config;
        } catch (_e) {
            return null;
        }
    },

    /**
     * Codifica un oggetto di configurazione in Base64 URL-safe (Stateless).
     * @param {object} config - L'oggetto configurazione
     * @returns {string} Stringa Base64 URL-safe con prefisso 'c1'
     */
    encodeConfig(config) {
        const json = JSON.stringify(config);
        const compressed = zlib.deflateSync(json);
        return 'c1' + compressed.toString('base64url');
    }
};

module.exports = UserConfig;
