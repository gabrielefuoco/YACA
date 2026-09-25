const AddonConfig = require('../db/models/AddonConfig');
const UserAccount = require('../db/models/UserAccount');
const { buildManifestFingerprint } = require('./manifestFingerprint');
const { updateStremioAddonCollection } = require('./stremioAddon');
const { nanoid } = require('nanoid');

/**
 * Reconciles Stremio manifests across all AddonConfig documents.
 * 
 * Runs sequentially, never throws, and logs a final summary.
 * For each AddonConfig:
 * 1. Checks if manifestFingerprint differs from current code + config definitions
 *    (or if configVersion is missing).
 * 2. If changed, bumps configVersion with nanoid(8), saves new fingerprint,
 *    and sets pendingStremioResync = true.
 * 3. For any config with pendingStremioResync === true and a linked UserAccount with
 *    stremio authKey and userId, updates the Stremio collection.
 * 4. Clears pendingStremioResync on success; preserves it on failure for next startup.
 */
async function reconcileManifests() {
    let examined = 0;
    let updated = 0;
    let resyncOk = 0;
    let resyncFailed = 0;

    try {
        const configs = await AddonConfig.find({});
        examined = configs ? configs.length : 0;

        for (const configDoc of configs) {
            try {
                const configObj = configDoc.config || {};
                let currentVersion = configObj.configVersion;
                let pendingResync = Boolean(configObj.pendingStremioResync);

                const currentFingerprint = buildManifestFingerprint({
                    activeProfileId: configObj.activeProfileId,
                    profiles: configDoc.profiles || [],
                    customCatalogs: configDoc.customCatalogs || []
                });

                const savedFingerprint = typeof configObj.manifestFingerprint === 'string'
                    ? configObj.manifestFingerprint
                    : null;

                const hasConfigVersion = typeof currentVersion === 'string' && currentVersion.trim().length > 0;
                const manifestChanged = !hasConfigVersion || !savedFingerprint || savedFingerprint !== currentFingerprint;

                const filter = configDoc._id ? { _id: configDoc._id } : { uuid: configDoc.uuid };

                if (manifestChanged) {
                    currentVersion = nanoid(8);
                    pendingResync = true;

                    await AddonConfig.updateOne(
                        filter,
                        {
                            $set: {
                                'config.configVersion': currentVersion,
                                'config.manifestFingerprint': currentFingerprint,
                                'config.pendingStremioResync': true
                            }
                        }
                    );

                    if (!configDoc.config) configDoc.config = {};
                    configDoc.config.configVersion = currentVersion;
                    configDoc.config.manifestFingerprint = currentFingerprint;
                    configDoc.config.pendingStremioResync = true;
                    updated++;
                }

                if (pendingResync) {
                    const account = await UserAccount.findOne({ addonUuid: configDoc.uuid });
                    const stremioAuthKey = account?.apiKeys?.stremio;
                    const userId = account?.userId;

                    if (stremioAuthKey && userId) {
                        const hostUrl = process.env.HOST_URL;
                        if (!hostUrl) {
                            console.warn(`[ManifestReconciler] HOST_URL non configurato: resync Stremio saltato per utente ${userId}`);
                        } else {
                            const cleanHost = hostUrl.replace(/\/+$/, '');
                            const manifestUrl = `${cleanHost}/${userId}/${currentVersion}/manifest.json`;

                            try {
                                const result = await updateStremioAddonCollection(stremioAuthKey, manifestUrl);
                                if (result && result.success) {
                                    await AddonConfig.updateOne(
                                        filter,
                                        {
                                            $set: {
                                                'config.pendingStremioResync': false
                                            }
                                        }
                                    );
                                    if (configDoc.config) {
                                        configDoc.config.pendingStremioResync = false;
                                    }
                                    resyncOk++;
                                } else {
                                    resyncFailed++;
                                    console.warn(`[ManifestReconciler] Resync fallito per utente ${userId}: ${result?.error || 'Errore sconosciuto'}`);
                                }
                            } catch (err) {
                                resyncFailed++;
                                console.warn(`[ManifestReconciler] Eccezione durante resync Stremio per utente ${userId}: ${err.message}`);
                            }
                        }
                    }
                }
            } catch (configErr) {
                console.warn(`[ManifestReconciler] Errore elaborazione config ${configDoc?.uuid}: ${configErr.message}`);
            }
        }
    } catch (globalErr) {
        console.error(`[ManifestReconciler] Errore generale durante riconciliazione: ${globalErr.message}`);
    }

    console.log(`[ManifestReconciler] Riconciliazione: ${examined} config esaminati, ${updated} versioni aggiornate, ${resyncOk} resync ok, ${resyncFailed} falliti`);
    return { examined, updated, resyncOk, resyncFailed };
}

module.exports = {
    reconcileManifests
};
