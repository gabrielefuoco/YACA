/**
 * libraryConversionAdmission.js
 *
 * La regola di ammissione della coda di conversione: «questo item va convertito
 * in questo giro?». Prima la decisione era una query al database, quindi l'unico
 * modo di verificarla era toccare Atlas. Qui è una funzione pura alimentata dai
 * soli campi dell'item, così i test coprono i quattro casi senza aprire connessioni.
 *
 * I criteri sono quelli di sempre, nell'ordine in cui venivano applicati dalla query:
 * non convertito, non rimosso, non un duplicato marcato.
 *
 * Motivi di esclusione (stabili: vengono loggati e usati dai test):
 *   - `already-mapped`  l'item è già convertito (mapped: true)
 *   - `removed`         l'utente l'ha rimosso dalla libreria (removed: true)
 *   - `duplicate`       è un duplicato marcato e punta al primario (duplicateOf)
 *   - `parked`          ha esaurito i tentativi (parkedAt, vedi libraryConversionRetry)
 */

const { isParked, PARKED_REASONS } = require('./libraryConversionRetry');

/** Motivi di esclusione, in costanti per evitare stringhe sparse nei test e nei log. */
const EXCLUSION_REASONS = Object.freeze({
    ALREADY_MAPPED: 'already-mapped',
    REMOVED: 'removed',
    DUPLICATE: 'duplicate',
    ...PARKED_REASONS
});

/**
 * Valuta un singolo item della libreria.
 *
 * @param {{mapped?: boolean, removed?: boolean, duplicateOf?: string|null, parkedAt?: Date|string|null}} item
 * @returns {{eligible: boolean, reason: string|null}} `reason` è null quando l'item è eleggibile
 */
function evaluateConversionAdmission(item) {
    if (!item || typeof item !== 'object') {
        return { eligible: false, reason: EXCLUSION_REASONS.ALREADY_MAPPED };
    }

    if (item.mapped === true) {
        return { eligible: false, reason: EXCLUSION_REASONS.ALREADY_MAPPED };
    }
    if (item.removed === true) {
        return { eligible: false, reason: EXCLUSION_REASONS.REMOVED };
    }
    if (item.duplicateOf !== null && item.duplicateOf !== undefined && item.duplicateOf !== '') {
        return { eligible: false, reason: EXCLUSION_REASONS.DUPLICATE };
    }
    // Un item parcheggiato ha esaurito i tentativi: torna in coda solo se qualcuno
    // lo rimette in giro azzerando i campi del parcheggio (cambio di dato, non di codice).
    if (isParked(item)) {
        return { eligible: false, reason: EXCLUSION_REASONS.PARKED };
    }

    return { eligible: true, reason: null };
}

/**
 * Filtra una lista di item con la stessa regola, restituendo solo gli eleggibili.
 *
 * @param {Array} items
 * @returns {Array}
 */
function selectConvertibleItems(items) {
    return (items || []).filter(item => evaluateConversionAdmission(item).eligible);
}

module.exports = {
    EXCLUSION_REASONS,
    evaluateConversionAdmission,
    selectConvertibleItems
};
