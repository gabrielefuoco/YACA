/**
 * src/profile/impressions.js
 *
 * Registrazione (e lettura) delle impressioni dei titoli serviti nelle raccomandazioni del profilo.
 * Posseduto da src/profile (Ticket 41 - Step 6; lettura: Ticket 14).
 *
 * Ticket 14: per dieci anni questo modulo ha solo SCRITTO. Ora `leggiImpressioniRecenti` riporta, per
 * catalogo, quali titoli sono stati mostrati in pagina 1 e per quanti giorni distinti nella finestra:
 * il pool li fa scendere (mai sparire) con un decadimento sul punteggio (`src/pool/impressioni.js`).
 */

const mongoose = require('mongoose');
const RecommendationImpression = require('../models/RecommendationImpression');
const { normalizeContentId } = require('../catalog/contentId');

/** La finestra: oltre, un titolo mostrato tanto tempo fa non e' piu' "in cima da giorni" (Ticket 14). */
const IMPRESSIONI_FINESTRA_GIORNI = 14;
/** Le righe di home gia' lette restano valide questo tempo: composer chiama il pool UNA VOLTA PER
 *  CATALOGO, e senza questa memoria una schermata da dieci righe farebbe dieci query identiche. */
const IMPRESSIONI_MEMO_MS = 60 * 1000;

const memoLetture = new Map();

/** Il giorno UTC in `YYYY-MM-DD`: scrittore e lettore devono usare la stessa nozione di giorno. */
function giornoUTC(d = new Date()) {
    return d.toISOString().split('T')[0];
}

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

    const currentDateStr = giornoUTC();
    const ops = items.map(item => {
        const rawId = item?.id || item?.tmdbId || item;
        return {
            updateOne: {
                filter: {
                    owner: userId,
                    // Stessa normalizzazione della lettura: una riga scritta con `undefined` non si
                    // ritroverebbe piu'.
                    profileId: context || 'global',
                    catalogId: catalogId,
                    tmdbId: normalizeContentId(rawId)
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
                console.error('[Impressioni] errore in scrittura:', err.message);
            });
        });
    }
}

/**
 * Riduce le righe del modello a `catalogId -> (tmdbId -> giorni distinti nella finestra)`.
 * Puro: la finestra si applica QUI, perche' il modello tiene tutto lo storico (`seenDates`).
 * I giorni sono un INSIEME: una data ripetuta (documento vecchio o modificato a mano) conta una volta.
 *
 * @param {Array<{catalogId: string, tmdbId: string, seenDates: string[]}>} righe
 * @param {string} soglia data YYYY-MM-DD piu' vecchia ammessa (inclusa)
 * @returns {Map<string, Map<string, number>>}
 */
function aggregaImpressioni(righe, soglia) {
    const perCatalogo = new Map();
    for (const r of (righe || [])) {
        const giorni = new Set(
            (r.seenDates || [])
                .map((d) => String(d).slice(0, 10))
                .filter((d) => d >= soglia)
        );
        if (giorni.size === 0) continue;
        if (!perCatalogo.has(r.catalogId)) perCatalogo.set(r.catalogId, new Map());
        perCatalogo.get(r.catalogId).set(String(r.tmdbId), giorni.size);
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
 * @param {boolean} [params.memo] usa la memoria breve di 60 s (la porta del pool la usa: composer la
 *   chiama una volta per catalogo e senza memoria farebbe dieci query identiche per schermata)
 * @returns {Promise<Map<string, Map<string, number>>>} catalogId -> (tmdbId -> giorni distinti)
 */
async function leggiImpressioniRecenti({
    userId,
    profileId,
    catalogIds = null,
    giorni = IMPRESSIONI_FINESTRA_GIORNI,
    memo = false
} = {}) {
    const vuoto = new Map();
    if (!userId) return vuoto;
    // Senza connessione non si interroga (mongoose metterebbe la query in buffer e la richiesta
    // resterebbe appesa): nessuna impressione, nessun decadimento, e la riga resta com'e'.
    if (mongoose.connection?.readyState !== 1) return vuoto;
    // Un insieme vuoto di cataloghi non deve diventare "tutti": la query perderebbe il filtro.
    if (Array.isArray(catalogIds) && catalogIds.length === 0) return vuoto;

    const ampiezza = Math.max(1, Number(giorni) || IMPRESSIONI_FINESTRA_GIORNI);
    const chiave = memo
        ? `${userId}|${profileId || 'global'}|${ampiezza}|${Array.isArray(catalogIds) ? [...catalogIds].sort().join(',') : '*'}`
        : null;
    if (chiave) {
        const voce = memoLetture.get(chiave);
        if (voce && voce.scade > Date.now()) return voce.valore;
    }

    // `now` troncato al giorno: la finestra e' di `ampiezza` giornate esatte, non di 14 giorni + oggi.
    const oggi = new Date(giornoUTC() + 'T00:00:00.000Z');
    const soglia = giornoUTC(new Date(oggi.getTime() - (ampiezza - 1) * 24 * 60 * 60 * 1000));

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
        const valore = aggregaImpressioni(righe, soglia);
        if (chiave) memoLetture.set(chiave, { valore, scade: Date.now() + IMPRESSIONI_MEMO_MS });
        return valore;
    } catch (err) {
        // Un guasto di lettura non deve togliere il feed: si dichiara e si prosegue senza decadimento.
        console.warn('[Impressioni] lettura fallita, nessun decadimento:', err?.message || err);
        return vuoto;
    }
}

/** Svuota la memoria breve (test e cambio di profilo). */
function svuotaMemoImpressioni() {
    memoLetture.clear();
}

module.exports = {
    recordRecommendationImpressions,
    registraImpressioni: recordRecommendationImpressions,
    leggiImpressioniRecenti,
    aggregaImpressioni,
    giornoUTC,
    svuotaMemoImpressioni,
    IMPRESSIONI_FINESTRA_GIORNI,
    IMPRESSIONI_MEMO_MS
};
