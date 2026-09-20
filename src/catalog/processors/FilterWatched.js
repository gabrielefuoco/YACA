const TasteProfile = require('../../models/TasteProfile');
const WatchHistory = require('../../models/WatchHistory');
const { normalizeContentId } = require('../../utils/contentId');

/**
 * Filtra i contenuti già visti dall'utente se l'opzione è attiva (Fase 10).
 * @param {Array} metas Lista dei contenuti da filtrare
 * @param {Object} userConfig Configurazione dell'utente
 * @returns {Promise<Array>} Lista filtrata
 */
async function filterWatchedItems(metas, userConfig) {
    if (!metas || metas.length === 0 || !userConfig?.config?.hideWatched) {
        return metas;
    }

    const userId = userConfig.userId;
    const watchedIds = new Set();

    // 1. Carichiamo la cronologia da WatchHistory
    try {
        const query = WatchHistory.find({ owner: userId });
        const history = (query && typeof query.lean === 'function') ? await query.lean() : await query;
        if (Array.isArray(history)) {
            for (const item of history) {
                if (item?.tmdbId) {
                    watchedIds.add(normalizeContentId(item.tmdbId));
                }
            }
        }
    } catch (err) {
        // Fallback or ignore DB error
    }

    // 2. Carichiamo il profilo globale per compatibilità legacy (processedTraktIds + processedStremioIds)
    try {
        const profile = await TasteProfile.findOne({ owner: userId, context: 'global' });
        if (profile) {
            for (const id of (profile.processedTraktIds || [])) {
                watchedIds.add(normalizeContentId(id));
            }
            for (const id of (profile.processedStremioIds || [])) {
                watchedIds.add(normalizeContentId(id));
            }
        }
    } catch (err) {
        // Fallback or ignore DB error
    }

    if (watchedIds.size === 0) return metas;

    return metas.filter(item => {
        // Estraiamo l'ID TMDB puro (es. 'tmdb:123' -> '123')
        const rawId = normalizeContentId(item.id);
        return !watchedIds.has(rawId);
    });
}

module.exports = { filterWatchedItems };
