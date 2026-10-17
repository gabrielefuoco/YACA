/**
 * libraryConversionOutcome.js
 *
 * L'esito di un giro di conversione: che cosa si scrive su ciascun item e che
 * cosa si dice all'operatore quando il giro finisce.
 *
 * Il punto: un item che il giro **non** è riuscito a risolvere non viene dato per
 * convertito. Restare eleggibile al giro dopo è il comportamento giusto, perché la
 * mappatura Kitsu→TMDB si aggiorna da sola e un titolo irrisolvibile oggi spesso si
 * risolve fra qualche giorno: nessuno deve più rimettere a mano un flag per farlo
 * riprovare.
 *
 * Anche questo è funzione pura alimentata dai dati, quindi verificabile senza rete
 * e senza database: il ciclo di produzione la chiama, i test la chiamano da soli.
 *
 * Motivi (stabili: finiscono nei log e nei test):
 *   - `item-has-tmdb-id` l'item aveva già un TMDB id (non è passato dalla risoluzione)
 *   - gli altri sono i motivi della risoluzione (`libraryIdentityResolution.js`):
 *     `not-found` (l'id è riconosciuto ma non si risolve), `unsupported` (fonte non
 *     gestita dal ciclo).
 */

const { RESOLUTION_REASONS } = require('./libraryIdentityResolution');

/** Motivi dell'esito che non vengono dalla risoluzione dell'identità. */
const OUTCOME_REASONS = Object.freeze({
    ITEM_ALREADY_HAS_TMDB_ID: 'item-has-tmdb-id',
    AMBIGUOUS_TYPE: 'ambiguous-type'
});

/**
 * Come si traduce in parole, per l'operatore, il motivo per cui un item è rimasto
 * non risolto. Non è un log di debug: è la riga che dice «ho lasciato in coda
 * questi, e so perché».
 */
const UNRESOLVED_LABELS = Object.freeze({
    [RESOLUTION_REASONS.NOT_FOUND]: 'assenti dalla mappatura',
    [RESOLUTION_REASONS.UNSUPPORTED_SOURCE]: 'fonte non gestita',
    [OUTCOME_REASONS.AMBIGUOUS_TYPE]: 'tipo non noto'
});

/** Motivo di fallback quando un item non risolto non ha un motivo conosciuto. */
const UNKNOWN_REASON = 'senza-approfondimenti';

/** Un id c'è solo se è qualcosa di diverso da vuoto, zero-ish e non un numero finto. */
function hasTmdbId(tmdbId) {
    if (tmdbId === null || tmdbId === undefined || tmdbId === '') return false;
    const asNumber = Number(tmdbId);
    if (Number.isNaN(asNumber)) return String(tmdbId).trim().length > 0;
    return asNumber > 0;
}

/**
 * Decide l'esito di un item a partire dal TMDB id (eventualmente già presente
 * sull'item) e dal verdetto della risoluzione dell'identità.
 *
 * @param {{tmdbId?: number|string|null, identity?: {resolved?: boolean, tmdbId?: number|string|null, reason?: string}|null, ambiguousType?: boolean}} input
 * @returns {{resolved: boolean, tmdbId: number|string|null, reason: string}}
 */
function decideConversionOutcome(input = {}) {
    const { tmdbId, identity, ambiguousType } = input || {};

    if (ambiguousType === true || identity?.reason === OUTCOME_REASONS.AMBIGUOUS_TYPE) {
        return {
            resolved: false,
            tmdbId: null,
            reason: OUTCOME_REASONS.AMBIGUOUS_TYPE
        };
    }

    const fromIdentity = hasTmdbId(identity?.tmdbId) ? identity.tmdbId : null;

    if (fromIdentity !== null) {
        return {
            resolved: true,
            tmdbId: fromIdentity,
            reason: identity.reason || OUTCOME_REASONS.ITEM_ALREADY_HAS_TMDB_ID
        };
    }

    if (hasTmdbId(tmdbId)) {
        return {
            resolved: true,
            tmdbId,
            reason: OUTCOME_REASONS.ITEM_ALREADY_HAS_TMDB_ID
        };
    }

    return {
        resolved: false,
        tmdbId: null,
        reason: identity?.reason || RESOLUTION_REASONS.NOT_FOUND
    };
}

/**
 * Che cosa si scrive sull'item dopo il giro. Il punto del ticket: `mapped` segue
 * l'esito, non il fatto di essere passati dal ciclo — un item non risolto resta
 * `mapped: false`, cioè eleggibile al giro dopo.
 *
 * @param {{mapped?: boolean}} item l'item come era (non viene modificato)
 * @param {{resolved: boolean, tmdbId: number|string|null, reason: string}} outcome
 * @returns {{tmdbId: number|string|null, mapped: boolean, resolved: boolean, reason: string}}
 */
function applyConversionOutcome(item, outcome) {
    return {
        tmdbId: outcome.resolved ? outcome.tmdbId : null,
        mapped: outcome.resolved === true,
        resolved: outcome.resolved === true,
        reason: outcome.reason
    };
}

/**
 * Descrrive il giro intero a partire dagli esiti: quante conversioni sono avvenute
 * e chi è rimasto in coda, col motivo.
 *
 * @param {Array<{itemId: string, outcome: {resolved: boolean, reason: string}}>} results
 * @returns {{converted: number, unresolved: Array<{itemId: string, reason: string}>}}
 */
function buildConversionState(results = []) {
    const converted = [];
    const unresolved = [];

    for (const entry of results || []) {
        const itemId = entry?.itemId !== undefined && entry.itemId !== null ? String(entry.itemId) : '';
        if (entry?.outcome?.resolved === true) {
            converted.push(itemId);
        } else {
            unresolved.push({ itemId, reason: entry?.outcome?.reason || UNKNOWN_REASON });
        }
    }

    return { converted: converted.length, unresolved };
}

/**
 * La riga di chiusura del giro: quanti item sono rimasti non risolti e perché, in
 * una riga sola (per l'operatore). `null` se non è rimasto nessuno.
 *
 * @param {Array<{itemId: string, reason: string}>} unresolved
 * @returns {string|null}
 */
function summarizeUnresolvedRun(unresolved = []) {
    const list = Array.isArray(unresolved) ? unresolved : [];
    if (list.length === 0) return null;

    const byReason = new Map();
    for (const entry of list) {
        const reason = entry?.reason || UNKNOWN_REASON;
        byReason.set(reason, (byReason.get(reason) || 0) + 1);
    }

    const parts = [...byReason.entries()]
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
        .map(([reason, count]) => `${count} ${UNRESOLVED_LABELS[reason] || reason}`);

    const noun = list.length === 1 ? 'item non risolto resta' : 'item non risolti restano';
    return `${list.length} ${noun} in coda (${parts.join(', ')}): torneranno nel giro dopo`;
}

module.exports = {
    OUTCOME_REASONS,
    UNRESOLVED_LABELS,
    hasTmdbId,
    decideConversionOutcome,
    applyConversionOutcome,
    buildConversionState,
    summarizeUnresolvedRun
};
