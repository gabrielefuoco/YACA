const { createAxiosInstance } = require('./httpClient');

const ADDON_ID = 'org.stremio.yaca.catalog';
const STREMIO_TIMEOUT = 10000;

const stremioClient = createAxiosInstance('https://api.strem.io');

/**
 * Aggiorna o aggiunge l'addon YACA nella collezione Stremio dell'utente.
 * Logica condivisa tra l'endpoint /api/stremio-addon-update e il refresh automatico Trakt.
 *
 * @param {string} authKey - La chiave di autenticazione Stremio dell'utente
 * @param {string} manifestUrl - L'URL completo del manifest dell'addon
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function updateStremioAddonCollection(authKey, manifestUrl) {
    const getRes = await stremioClient.post('/api/addonCollectionGet', {
        type: 'AddonCollectionGet',
        authKey,
        update: true,
        addFromURL: []
    }, { timeout: STREMIO_TIMEOUT });

    const addons = getRes.data?.result?.addons;
    if (!addons || !Array.isArray(addons)) {
        return { success: false, error: 'Impossibile recuperare la collezione addon' };
    }

    const existingIdx = addons.findIndex(a => a.manifest?.id === ADDON_ID);

    const manifestRes = await stremioClient.get(manifestUrl, { timeout: STREMIO_TIMEOUT });
    const manifest = manifestRes.data;

    if (existingIdx !== -1) {
        addons[existingIdx].transportUrl = manifestUrl;
        addons[existingIdx].manifest = manifest;
    } else {
        addons.push({
            transportUrl: manifestUrl,
            transportName: 'http',
            manifest: manifest,
            flags: { official: false, protected: false }
        });
    }

    const setRes = await stremioClient.post('/api/addonCollectionSet', {
        type: 'AddonCollectionSet',
        authKey,
        addons
    }, { timeout: STREMIO_TIMEOUT });

    if (setRes.data?.result?.success) {
        return { success: true };
    }
    return { success: false, error: setRes.data?.result?.error || 'Errore aggiornamento collezione' };
}

module.exports = { updateStremioAddonCollection };
