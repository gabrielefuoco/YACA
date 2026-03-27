const TasteProfile = require('../../models/TasteProfile');
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
    // Carichiamo il profilo globale per avere la history completa (Trakt + Stremio)
    const profile = await TasteProfile.findOne({ owner: userId, context: 'global' });
    if (!profile) return metas;

    const watchedIds = new Set([
        ...(profile.processedTraktIds || []),
        ...(profile.processedStremioIds || [])
    ].map(normalizeContentId));

    if (watchedIds.size === 0) return metas;

    return metas.filter(item => {
        // Estraiamo l'ID TMDB puro (es. 'tmdb:123' -> '123')
        const rawId = normalizeContentId(item.id);
        return !watchedIds.has(rawId);
    });
}

module.exports = { filterWatchedItems };
