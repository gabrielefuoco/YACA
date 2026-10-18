/**
 * src/profile/impressions.js
 *
 * Registrazione delle impressioni dei titoli serviti nelle raccomandazioni del profilo.
 * Posseduto da src/profile (Ticket 41 - Step 6).
 */

const mongoose = require('mongoose');
const RecommendationImpression = require('../models/RecommendationImpression');

/**
 * Registra le impressioni dei titoli raccomandati alla prima pagina (skip === 0).
 *
 * @param {string} userId ID utente
 * @param {string} context ID profilo
 * @param {string} catalogId ID del catalogo
 * @param {Array<object>} items Elementi raccomandati serviti
 */
function recordRecommendationImpressions(userId, context, catalogId, items) {
    if (!Array.isArray(items) || items.length === 0) return;

    const currentDateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const ops = items.map(item => {
        const rawId = item?.id || item?.tmdbId || item;
        const normalizedId = String(rawId).replace(/^tmdb:/, '');
        return {
            updateOne: {
                filter: {
                    owner: userId,
                    profileId: context,
                    catalogId: catalogId,
                    tmdbId: normalizedId
                },
                update: {
                    $addToSet: { seenDates: currentDateStr }
                },
                upsert: true
            }
        };
    });

    if (process.env.NODE_ENV !== 'test' && mongoose.connection?.readyState === 1) {
        global.setImmediate(() => {
            RecommendationImpression.bulkWrite(ops).catch(err => {
                console.error('[Impression-Tracking] Error during bulkWrite:', err.message);
            });
        });
    }
}

module.exports = {
    recordRecommendationImpressions,
    registraImpressioni: recordRecommendationImpressions
};
