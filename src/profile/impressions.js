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
/** Tetto della memoria: oltre, si buttano le voci piu' vecchie (non e' una cache di dati preziosi). */
const IMPRESSIONI_MEMO_MAX = 500;

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
 * @returns {Map<string, Map<string, {giorni: number, ultimo: string}>>}
 */
function aggregaImpressioni(righe, soglia) {
    const perCatalogo = new Map();
    for (const r of (righe || [])) {
        const giorni = [...new Set(
            (r.seenDates || [])
                .map((d) => String(d).slice(0, 10))
                .filter((d) => d >= soglia)
        )].sort();
        if (giorni.length === 0) continue;
        if (!perCatalogo.has(r.catalogId)) perCatalogo.set(r.catalogId, new Map());
        // `giorni` = quanti giorni distinti; `ultimo` = l'ultima volta in home. Il secondo serve al reset
        // del ticket 21: un titolo che non compare piu' torna al punteggio pieno.
        perCatalogo.get(r.catalogId).set(String(r.tmdbId), {
            giorni: giorni.length,
            ultimo: giorni[giorni.length - 1]
        });
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
 * @returns {Promise<Map<string, Map<string, {giorni: number, ultimo: string}>>>} catalogId -> (tmdbId -> giorni)
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
        if (voce && voce.scade > Date.now()) {
            // Si memoizza la PROMISE, non il valore: dieci chiamate concorrenti (una per catalogo)
            // devono fare UNA query, non dieci.
            return voce.resultato;
        }
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

    const lettura = (async () => {
        try {
            const righe = await RecommendationImpression
                .find(filtro, { catalogId: 1, tmdbId: 1, seenDates: 1 })
                .lean();
            return aggregaImpressioni(righe, soglia);
        } catch (err) {
            // Un guasto di lettura non deve togliere il feed: si dichiara e si prosegue senza decadimento.
            console.warn('[Impressioni] lettura fallita, nessun decadimento:', err?.message || err);
            return vuoto;
        }
    })();

    if (!chiave) return lettura;

    // Una voce per chiave, con scadenza: le scadute si buttano quando se ne scrive una nuova, e se la
    // memoria supera il tetto si buttano le piu' vecchie.
    memoLetture.set(chiave, { risultato: lettura, scade: Date.now() + IMPRESSIONI_MEMO_MS });
    if (memoLetture.size > IMPRESSIONI_MEMO_MAX) {
        const adesso = Date.now();
        for (const [k, v] of memoLetture) {
            if (v.scade <= adesso) memoLetture.delete(k);
        }
        while (memoLetture.size > IMPRESSIONI_MEMO_MAX) {
            memoLetture.delete(memoLetture.keys().next().value);
        }
    }
    return lettura;
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
    IMPRESSIONI_MEMO_MS,
    IMPRESSIONI_MEMO_MAX
};
