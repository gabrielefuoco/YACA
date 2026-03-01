/**
 * Stateless UserConfig: codifica/decodifica la configurazione utente in Base64 URL-safe.
 * Non usa più database — la configurazione è trasportata direttamente nell'URL.
 */

const UserConfig = {
    /**
     * Decodifica una stringa Base64 URL-safe in un oggetto di configurazione.
     * @param {string} base64Str - Stringa Base64 URL-safe
     * @returns {object|null} L'oggetto configurazione, o null se non valido
     */
    decodeConfig(base64Str) {
        try {
            const json = Buffer.from(base64Str, 'base64url').toString('utf8');
            const config = JSON.parse(json);
            if (!config || typeof config !== 'object' || !config.apiKeys) return null;
            return config;
        } catch (_e) {
            return null;
        }
    },

    /**
     * Codifica un oggetto di configurazione in Base64 URL-safe.
     * @param {object} config - L'oggetto configurazione
     * @returns {string} Stringa Base64 URL-safe
     */
    encodeConfig(config) {
        return Buffer.from(JSON.stringify(config)).toString('base64url');
    },

    /**
     * Costruisce e restituisce la configurazione processata (senza salvarla nel DB).
     * @returns {object} { config, configBase64, configVersion }
     */
    buildConfig({ apiKeys, catalogs, profiles, activeProfileId }) {
        const configVersion = Date.now().toString(36);
        const config = {
            apiKeys,
            catalogs,
            profiles,
            activeProfileId,
            configVersion
        };
        const configBase64 = UserConfig.encodeConfig(config);
        return { config, configBase64, configVersion };
    }
};

module.exports = UserConfig;
