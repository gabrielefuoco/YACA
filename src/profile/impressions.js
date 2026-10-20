/**
 * src/profile/impressions.js
 *
 * Registrazione (e lettura) delle impressioni dei titoli serviti nelle raccomandazioni del profilo.
 * Posseduto da src/profile (Ticket 41 - Step 6; lettura: Ticket 14).
 *
 * Ticket 14: per dieci anni questo modulo ha solo SCRITTO. Ora `leggiImpressioniRecenti` riporta, per
 * catalogo, quali titoli sono stati mostrati in pagina 1 e per quanti giorni distinti nella finestra:
 * il pool li fa scendere (mai sparire) con un decadimento sul punteggio.
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

/** Titoli mostrati cosi' tante volte da meritare di scendere (Ticket 14). */
const IMPRESSIONI_GIORNI_MINIMI = 3;
/** Quanto pesa un giorno in piu' in home: 0.85^n (Ticket 14). */
const IMPRESSIONI_FATTORE_GIORNO = 0.85;
/** La finestra: oltre, un titolo mostrato tanto tempo fa non e' piu' "in cima da giorni". */
const IMPRESSIONI_FINESTRA_GIORNI = 14;

/**
 * Riduce le righe del modello a `catalogId -> (tmdbId -> giorni distinti nella finestra)`.
 * Puro: la finestra si applica QUI, perche' il modello tiene tutto lo storico (`seenDates`).
 *
 * @param {Array<{catalogId: string, tmdbId: string, seenDates: string[]}>} righe
 * @param {string} soglia data YYYY-MM-DD piu' vecchia ammessa (inclusa)
 * @returns {Map<string, Map<string, number>>}
 */
function aggregaImpressioni(righe, soglia) {
    const perCatalogo = new Map();
    for (const r of (righe || [])) {
        const giorni = (r.seenDates || []).filter((d) => String(d) >= soglia).length;
        if (giorni === 0) continue;
        if (!perCatalogo.has(r.catalogId)) perCatalogo.set(r.catalogId, new Map());
        perCatalogo.get(r.catalogId).set(String(r.tmdbId), giorni);
    }
    return perCatalogo;
}

/**
 * Legge le impressioni recenti di un utente per un insieme di cataloghi (Ticket 14).
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.profileId
 * @param {string[]|null} [params.catalogIds] se null, tutte le righe del profilo
 * @param {number} [params.giorni] ampiezza della finestra (default 14)
 * @returns {Promise<Map<string, Map<string, number>>>} catalogId -> (tmdbId -> giorni distinti)
 */
async function leggiImpressioniRecenti({ userId, profileId, catalogIds = null, giorni = IMPRESSIONI_FINESTRA_GIORNI } = {}) {
    const vuoto = new Map();
    if (!userId) return vuoto;
    // Senza connessione non si interroga (mongoose metterebbe la query in buffer e la richiesta
    // resterebbe appesa): nessuna impressione, nessun decadimento, e la riga resta com'e'.
    if (mongoose.connection?.readyState !== 1) return vuoto;

    const soglia = new Date(Date.now() - (Math.max(1, Number(giorni) || IMPRESSIONI_FINESTRA_GIORNI)) * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    const filtro = {
        owner: userId,
        profileId: profileId || 'global',
        seenDates: { $gte: soglia }
    };
    if (Array.isArray(catalogIds) && catalogIds.length > 0) {
        filtro.catalogId = { $in: catalogIds };
    }

    try {
        const righe = await RecommendationImpression
            .find(filtro, { catalogId: 1, tmdbId: 1, seenDates: 1 })
            .lean();
        return aggregaImpressioni(righe, soglia);
    } catch (err) {
        // Un guasto di lettura non deve togliere il feed: si dichiara e si prosegue senza decadimento.
        console.warn('[Impression-Tracking] lettura fallita, nessun decadimento:', err?.message || err);
        return vuoto;
    }
}

module.exports = {
    recordRecommendationImpressions,
    registraImpressioni: recordRecommendationImpressions,
    leggiImpressioniRecenti,
    aggregaImpressioni,
    IMPRESSIONI_GIORNI_MINIMI,
    IMPRESSIONI_FATTORE_GIORNO,
    IMPRESSIONI_FINESTRA_GIORNI
};
