/**
 * src/library/syncRecommendations.js
 *
 * Sincronizzazione incrementale delle raccomandazioni (Trakt + Stremio -> Profile) (Ticket 41 - Fetta 1).
 * Spostato da src/engines/hybridRecommendations.js nel modulo src/library ("la sincronizzazione Trakt/Stremio dentro src/library").
 */

const TasteProfile = require('../models/TasteProfile');
const ProfileBuilder = require('../profile/ProfileBuilder');
const { isStremioSyncDue } = require('../profile/profileStaleness');
const { fetchRecentHistory, fetchRecentRatings } = require('./traktFetchers');
const dataFetchers = require('../engines/hybrid/dataFetchers');

/**
 * La parte Stremio (likes/loved) ha una cadenza PROPRIA, scritta sulla configurazione a
 * ogni sync (`config.lastStremioSync` + `config.nextSyncInterval`, 8 ore ± jitter).
 *
 * @param {object|null} userConfig configurazione risolta che porta il bookkeeping del sync
 * @returns {boolean} true se il sync Stremio è dovuto adesso
 */
function isStremioSyncDueForUser(userConfig) {
    const config = userConfig?.config || userConfig || {};
    return isStremioSyncDue(config.lastStremioSync, new Date(), config.nextSyncInterval);
}

/**
 * Sincronizzazione incrementale della cronologia utente da Trakt e Stremio.
 *
 * @param {string} userId ID utente
 * @param {'movie'|'series'} mediaType Tipo di media
 * @param {string} traktToken Access token Trakt
 * @param {string} tmdbApiKey Chiave TMDB per risoluzione metadati
 * @param {string} [context='global'] ID profilo
 * @param {object|null} [userConfig=null] Configurazione utente
 * @returns {Promise<boolean>} true se sincronizzato con modifiche
 */
async function syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context = 'global', userConfig = null) {
    if (!userId || !traktToken || !tmdbApiKey) return false;

    try {
        const stremioKey = userConfig?.apiKeys?.stremio || userConfig?.stremioKey;
        let stremioKeyToUse = stremioKey;
        if (!stremioKeyToUse) {
            try {
                const { accountDi } = require('../configurazione');
                const account = await accountDi(userId);
                stremioKeyToUse = account?.apiKeys?.stremio;
            } catch (_e) {}
        }
        if (stremioKeyToUse && isStremioSyncDueForUser(userConfig)) {
            try {
                const { syncAllStremioData } = require('../stremio');
                await syncAllStremioData(userId, stremioKeyToUse, context);
            } catch (sErr) {
                console.warn(`[LibrarySync] Stremio periodic likes sync failed:`, sErr.message);
            }
        }

        const traktType = mediaType === 'movie' ? 'movies' : 'shows';
        const fetchHistoryFn = typeof dataFetchers?.fetchRecentHistory === 'function' ? dataFetchers.fetchRecentHistory : fetchRecentHistory;
        const fetchRatingsFn = typeof dataFetchers?.fetchRecentRatings === 'function' ? dataFetchers.fetchRecentRatings : fetchRecentRatings;
        const [history, ratings] = await Promise.all([
            fetchHistoryFn(traktToken, traktType, 40, userConfig),
            fetchRatingsFn(traktToken, traktType, 40, userConfig)
        ]);
        const combined = [...(history || []), ...(ratings || [])];

        if (combined.length === 0) {
            if (typeof TasteProfile.updateOne === 'function') {
                await TasteProfile.updateOne({ owner: userId, context }, { $set: { lastUpdated: new Date() } });
            }
            return false;
        }

        const syncResult = await ProfileBuilder.syncUserHistory(userId, context, combined, tmdbApiKey);
        if (typeof TasteProfile.updateOne === 'function') {
            await TasteProfile.updateOne({ owner: userId, context }, { $set: { lastUpdated: new Date() } });
        }
        return syncResult !== false;
    } catch (err) {
        console.error(`[LibrarySync] syncIncrementalRecommendations failed for ${userId}/${context}:`, err.message);
        return false;
    }
}

module.exports = {
    isStremioSyncDueForUser,
    syncIncrementalRecommendations
};
