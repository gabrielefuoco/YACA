/**
 * Stateless UserConfig: codifica/decodifica la configurazione utente in Base64 URL-safe.
 * Non usa più database — la configurazione è trasportata direttamente nell'URL.
 * Le configurazioni vengono compresse con zlib deflate (prefisso 'c1') per ridurre la lunghezza dell'URL.
 */

const zlib = require('zlib');

const UserConfig = {
    /**
     * Decodifica una stringa Base64 URL-safe in un oggetto di configurazione.
     * Supporta sia il formato compresso ('c1' + deflate) che quello legacy non compresso.
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
     * Codifica un oggetto di configurazione in Base64 URL-safe con compressione deflate.
     * @param {object} config - L'oggetto configurazione
     * @returns {string} Stringa Base64 URL-safe con prefisso 'c1'
     */
    encodeConfig(config) {
        const json = JSON.stringify(config);
        const compressed = zlib.deflateSync(json);
        return 'c1' + compressed.toString('base64url');
    },

    /**
     * Costruisce e restituisce la configurazione processata (senza salvarla nel DB).
     * Il campo catalogs di primo livello viene omesso se profiles è presente, per evitare ridondanza.
     * @returns {object} { config, configBase64, configVersion }
     */
    buildConfig({ apiKeys, catalogs, profiles, activeProfileId }) {
        const configVersion = Date.now().toString(36);
        const config = {
            apiKeys,
            profiles,
            activeProfileId,
            configVersion
        };
        // Include top-level catalogs only when no profiles are present (legacy support)
        if (!profiles || profiles.length === 0) {
            config.catalogs = catalogs;
        }
        const configBase64 = UserConfig.encodeConfig(config);
        return { config, configBase64, configVersion };
    }
};

module.exports = UserConfig;
