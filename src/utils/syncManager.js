/**
 * SyncManager: Gestisce la sincronizzazione throttled (debounced) con Stremio.
 * Evita di chiamare troppo spesso le API di Stremio durante l'editing granulare.
 */

const { updateStremioAddonCollection } = require('./stremioAddonSync');

const SYNC_DEBOUNCE_MS = 20000; // 20 secondi tra un salvataggio e l'altro
const pendingSyncs = new Map();

/**
 * Pianifica una sincronizzazione con Stremio per l'utente specificato.
 * Se viene chiamata di nuovo per lo stesso utente prima dello scadere del timer, il timer viene resettato.
 */
function scheduleSync(userId, authKey, hostUrl, configVersion) {
    if (!authKey || !userId) return;

    // Cancella il sync precedente se esiste
    if (pendingSyncs.has(userId)) {
        clearTimeout(pendingSyncs.get(userId));
    }

    const manifestUrl = `${hostUrl}/${userId}/${configVersion}/manifest.json`;

    const timer = setTimeout(async () => {
        console.log(`[SyncManager] Esecuzione sync Stremio per utente: ${userId} (${configVersion})`);
        try {
            const result = await updateStremioAddonCollection(authKey, manifestUrl);
            if (result.success) {
                console.log(`[SyncManager] ✅ Sync completato per ${userId}`);
            } else {
                console.warn(`[SyncManager] ⚠️ Sync fallito per ${userId}: ${result.error}`);
            }
        } catch (err) {
            console.error(`[SyncManager] ❌ Errore critico sync per ${userId}:`, err.message);
        } finally {
            pendingSyncs.delete(userId);
        }
    }, SYNC_DEBOUNCE_MS);

    pendingSyncs.set(userId, timer);
}

module.exports = { scheduleSync };
