/**
 * libraryConversionRetry.js
 *
 * Il tetto ai tentativi. Il ticket 04 ha reso l'item irrisolto ri-eliggibile per
 * sempre — giusto finché la mappatura si aggiorna da sola, ma pericolo se un titolo
 * non si risolve mai: il giro lo riproverebbe all'infinito, macinando tempo e rate
 * limit per nulla. Qui un item che ha fallito un numero fisso di giri (3) viene
 * **parcheggiato**, col motivo dell'ultimo tentativo registrato.
 *
 * Il parcheggio è un dato, non un codice: sono tre campi (`conversionAttempts`,
 * `parkedAt`, `parkedReason`) e rimettere in giro un item parcheggiato è azzerarli,
 * senza toccare una riga di questo file. Ed è distinguibile da tutte e due le
 * altre situazioni: un convertito ha `mapped: true`, un parcheggiato ha
 * `mapped: false` con `parkedAt` valorizzato, uno in coda ha `mapped: false` e
 * `parkedAt` vuoto.
 *
 * Anche questo è funzione pura alimentata dai dati: il ciclo di produzione la
 * chiama, i test la chiamano da soli, senza rete e senza database.
 */

const { UNRESOLVED_LABELS, UNKNOWN_REASON } = require('./libraryConversionOutcome');

/** Tetto: quanti giri può fallire un item prima di essere parcheggiato. */
const MAX_CONVERSION_ATTEMPTS = 3;

/**
 * Motivi di esclusione dalla coda che vengono da qui (gli altri sono in
 * `libraryConversionAdmission.js`): `parked` = ha esaurito i tentativi.
 */
const PARKED_REASONS = Object.freeze({
    PARKED: 'parked'
});

/**
 * Quanti tentativi ha già consumato l'item. `0` se non lo sappiamo: un campo
 * assente non è un tentativo perso, e una spazzatura non deve contare come `NaN`.
 *
 * @param {{conversionAttempts?: number|string|null}|null} item
 * @returns {number}
 */
function readConversionAttempts(item) {
    const raw = item?.conversionAttempts;
    const asNumber = Number(raw);
    if (raw === null || raw === undefined || raw === '' || Number.isNaN(asNumber)) return 0;
    return asNumber > 0 ? Math.floor(asNumber) : 0;
}

/**
 * Il dato di parcheggio è presente e valido? È l'unico modo di distinguere
 * «parcheggiato» da «in coda»: il campo `parkedAt`.
 *
 * @param {{parkedAt?: Date|string|null}} item
 * @returns {boolean}
 */
function isParked(item) {
    const parkedAt = item?.parkedAt;
    if (parkedAt === null || parkedAt === undefined || parkedAt === '') return false;
    return Number.isNaN(new Date(parkedAt).getTime()) ? false : true;
}

/**
 * Che cosa si scrive sull'item dopo il turno, riguardo al tetto: il conteggio dei
 * tentativi e l'eventuale parcheggio. Un esito risolto azzera tutto (l'item non
 * è più un problema); un esito non risolto consuma un tentativo e, se sono finiti,
 * si parcheggia col motivo registrato.
 *
 * @param {{conversionAttempts?: number|string|null, parkedAt?: Date|string|null}} item l'item come era (non viene modificato)
 * @param {{resolved: boolean, reason?: string}} outcome l'esito del giro
 * @param {{now?: Date|string}} [options] l'istante del parcheggio (per i test)
 * @returns {{conversionAttempts: number, parked: boolean, parkedAt: Date|null, parkedReason: string|null}}
 */
function applyConversionAttempt(item, outcome, options = {}) {
    if (outcome?.resolved === true) {
        return { conversionAttempts: 0, parked: false, parkedAt: null, parkedReason: null };
    }

    const attempts = readConversionAttempts(item) + 1;
    const reason = outcome?.reason || UNKNOWN_REASON;

    if (attempts < MAX_CONVERSION_ATTEMPTS) {
        // Non ancora: resta in coda, senza marcatura di parcheggio (è il dato che
        // distingue i due stati, quindi non si «annacqua» prima del tetto).
        return { conversionAttempts: attempts, parked: false, parkedAt: null, parkedReason: null };
    }

    const now = options.now ? new Date(options.now) : new Date();
    return {
        conversionAttempts: attempts,
        parked: true,
        parkedAt: Number.isNaN(now.getTime()) ? new Date() : now,
        parkedReason: reason
    };
}

/**
 * La riga di chiusura del giro per i parcheggiati: quanti ne ha messi da parte e
 * con quale motivo, in una riga sola. `null` se non ne ha parcheggiato nessuno.
 *
 * @param {Array<{itemId?: string, reason?: string, attempts?: number}>} parked
 * @returns {string|null}
 */
function summarizeParkedRun(parked = []) {
    const list = Array.isArray(parked) ? parked : [];
    if (list.length === 0) return null;

    const byReason = new Map();
    for (const entry of list) {
        const reason = entry?.reason || UNKNOWN_REASON;
        byReason.set(reason, (byReason.get(reason) || 0) + 1);
    }

    const parts = [...byReason.entries()]
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
        .map(([reason, count]) => `${count} ${UNRESOLVED_LABELS[reason] || reason}`);

    const noun = list.length === 1 ? 'item parcheggiato' : 'item parcheggiati';
    return `${list.length} ${noun} dopo ${MAX_CONVERSION_ATTEMPTS} tentativi (${parts.join(', ')})`;
}

module.exports = {
    MAX_CONVERSION_ATTEMPTS,
    PARKED_REASONS,
    readConversionAttempts,
    isParked,
    applyConversionAttempt,
    summarizeParkedRun
};