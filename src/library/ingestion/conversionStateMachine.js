/**
 * src/library/ingestion/conversionStateMachine.js
 *
 * ============================================================================
 * LA MACCHINA A STATI DELLA CONVERSIONE LIBRERIA (Ticket 16)
 * ============================================================================
 *
 * Questa macchina a stati governa il ciclo di vita e la persistenza dei metadati
 * di conversione per ciascun titolo in `UserLibraryItem`.
 *
 * ----------------------------------------------------------------------------
 * 1. STATI DI UN ITEM (`CONVERSION_STATES`)
 * ----------------------------------------------------------------------------
 * - `QUEUED` (in coda):
 *     `mapped: false`, `removed: false`, `duplicateOf: null`, `parkedAt: null`, `conversionAttempts < 3`.
 *     L'item è eleggibile per il batch di conversione (`evaluateConversionAdmission(item).eligible === true`).
 *
 * - `CONVERTED` (convertito / mappato):
 *     `mapped: true`, `tmdbId` valorizzato.
 *     Stato terminale positivo per la conversione. Escluso dai cicli successivi (`already-mapped`).
 *     I contatori di tentativo e i campi di parcheggio sono azzerati:
 *     `conversionAttempts: 0`, `parkedAt: null`, `parkedReason: null`.
 *
 * - `PARKED` (parcheggiato):
 *     `mapped: false`, `parkedAt: Date`, `conversionAttempts >= 3`, `parkedReason: string`.
 *     L'item ha fallito il numero massimo consentito di tentativi (`MAX_CONVERSION_ATTEMPTS = 3`).
 *     È escluso dai giri di conversione (`reason: 'parked'`) per non consumare tempo e rate limit TMDB
 *     all'infinito su titoli inesistenti o irrisolvibili.
 *
 * - `EXCLUDED_REMOVED` (rimosso):
 *     `removed: true`. Titolo rimosso dall'utente o soft-deleted. Non eleggibile (`reason: 'removed'`).
 *
 * - `EXCLUDED_DUPLICATE` (duplicato):
 *     `duplicateOf: string`. Titolo secondario che punta a un record primario canonico.
 *     Non eleggibile (`reason: 'duplicate'`).
 *
 * ----------------------------------------------------------------------------
 * 2. REGOLE DEI TENTATIVI E PARCHEGGIO
 * ----------------------------------------------------------------------------
 * - QUANTI TENTATIVI:
 *     `MAX_CONVERSION_ATTEMPTS = 3`.
 *     Ogni giro di conversione in cui l'item non si risolve incrementa `conversionAttempts` di 1.
 *
 * - QUANDO SI PARCHEGGIA:
 *     Se dopo un tentativo fallito `conversionAttempts >= MAX_CONVERSION_ATTEMPTS`, l'item transiziona
 *     allo stato `PARKED`:
 *     - `parked = true`
 *     - `parkedAt = new Date()` (istante esatto del parcheggio)
 *     - `parkedReason = outcome.reason` (il motivo dell'ultimo fallimento, es. 'not-found', 'unsupported', 'ambiguous-type')
 *
 * - COME SI RIMETTE IN CODA (UNPARK):
 *     Il parcheggio è un DATO, non un codice. Rimettere in coda un item parcheggiato è un'operazione
 *     di reset dei dati (`unparkItem`):
 *     - `conversionAttempts: 0`
 *     - `parkedAt: null`
 *     - `parkedReason: null`
 *     Non richiede modifiche di codice. Può essere azionato da:
 *     a) Aggiornamento delle fonti esterne (es. nuovo dump Anibridge / Fribb in animeMappingStore);
 *     b) Azione manuale o amministrativa su un account o su un titolo;
 *     c) Risoluzione forzata / re-sync.
 *
 * ----------------------------------------------------------------------------
 * 3. CHI LEGGE `parkedAt`
 * ----------------------------------------------------------------------------
 * `parkedAt` è il discriminante fondamentale che distingue un item in coda da uno parcheggiato
 * (entrambi hanno `mapped: false`). I suoi lettori sono:
 * 1. `isParked(item)`:
 *    Interrogato da `evaluateConversionAdmission` in `libraryConversionAdmission.js` per escludere
 *    i titoli parcheggiati dai candidati elaborati da `LibraryConverterService`.
 * 2. `contaDaConvertire({ addonUuid })` in `src/library/reader.js`:
 *    Conta solo i titoli realmente da convertire escludendo `{ parkedAt: { $ne: null } }`.
 * 3. `leggiTitolo({ addonUuid, itemId })` in `src/library/reader.js`:
 *    Restituisce `conversionAttempts`, `parkedAt` e `parkedReason` per la consultazione dello stato.
 * 4. `summarizeParkedRun(parked)` in `libraryConversionRetry.js`:
 *    Formatta per l'operatore e i log il riepilogo sintetico dei titoli parcheggiati nel batch corrente.
 * ============================================================================
 */

const {
    OUTCOME_REASONS,
    UNRESOLVED_LABELS,
    UNKNOWN_REASON
} = require('./libraryConversionOutcome');

/** Quanti tentativi può fallire un item prima di essere parcheggiato. */
const MAX_CONVERSION_ATTEMPTS = 3;

/** Stati formali della macchina a stati */
const CONVERSION_STATES = Object.freeze({
    QUEUED: 'queued',
    CONVERTED: 'converted',
    PARKED: 'parked',
    EXCLUDED_REMOVED: 'excluded-removed',
    EXCLUDED_DUPLICATE: 'excluded-duplicate'
});

/** Motivi di esclusione derivanti dal parcheggio */
const PARKED_REASONS = Object.freeze({
    PARKED: 'parked'
});

/**
 * Quanti tentativi ha già consumato l'item. Default `0` se assente, nullo o NaN.
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
 * Verifica se l'item è attualmente parcheggiato (ha un parkedAt valido).
 *
 * @param {{parkedAt?: Date|string|null}|null} item
 * @returns {boolean}
 */
function isParked(item) {
    const parkedAt = item?.parkedAt;
    if (parkedAt === null || parkedAt === undefined || parkedAt === '') return false;
    return !Number.isNaN(new Date(parkedAt).getTime());
}

/**
 * Determina lo stato attuale dell'item secondo la macchina a stati.
 *
 * @param {object|null} item
 * @returns {string} uno dei valori di CONVERSION_STATES
 */
function getConversionState(item) {
    if (!item || typeof item !== 'object') return CONVERSION_STATES.CONVERTED;
    if (item.mapped === true) return CONVERSION_STATES.CONVERTED;
    if (item.removed === true) return CONVERSION_STATES.EXCLUDED_REMOVED;
    if (item.duplicateOf !== null && item.duplicateOf !== undefined && item.duplicateOf !== '') {
        return CONVERSION_STATES.EXCLUDED_DUPLICATE;
    }
    if (isParked(item)) return CONVERSION_STATES.PARKED;
    return CONVERSION_STATES.QUEUED;
}

/**
 * Predicato rapido: l'item è attualmente in coda per la conversione?
 *
 * @param {object|null} item
 * @returns {boolean}
 */
function isEligibleForConversion(item) {
    return getConversionState(item) === CONVERSION_STATES.QUEUED;
}

/**
 * Esegue la transizione di stato sui tentativi di conversione.
 *
 * @param {object} item l'item come era (non viene mutato)
 * @param {{resolved: boolean, reason?: string}} outcome l'esito del tentativo di risoluzione
 * @param {{now?: Date|string}} [options] timestamp di parcheggio opzionale
 * @returns {{conversionAttempts: number, parked: boolean, parkedAt: Date|null, parkedReason: string|null, nextState: string}}
 */
function applyConversionAttempt(item, outcome, options = {}) {
    if (outcome?.resolved === true) {
        return {
            conversionAttempts: 0,
            parked: false,
            parkedAt: null,
            parkedReason: null,
            nextState: CONVERSION_STATES.CONVERTED
        };
    }

    const attempts = readConversionAttempts(item) + 1;
    const reason = outcome?.reason || UNKNOWN_REASON;

    if (attempts < MAX_CONVERSION_ATTEMPTS) {
        return {
            conversionAttempts: attempts,
            parked: false,
            parkedAt: null,
            parkedReason: null,
            nextState: CONVERSION_STATES.QUEUED
        };
    }

    const now = options.now ? new Date(options.now) : new Date();
    return {
        conversionAttempts: attempts,
        parked: true,
        parkedAt: Number.isNaN(now.getTime()) ? new Date() : now,
        parkedReason: reason,
        nextState: CONVERSION_STATES.PARKED
    };
}

/**
 * Ripristina un item parcheggiato riportandolo allo stato QUEUED.
 * Azzeramento dei campi dati del parcheggio.
 *
 * @param {object|null} [item]
 * @returns {{conversionAttempts: number, parkedAt: null, parkedReason: null}}
 */
function unparkItem(item = null) {
    return {
        conversionAttempts: 0,
        parkedAt: null,
        parkedReason: null
    };
}

/**
 * Riepilogo testuale per log e monitoraggio dei titoli parcheggiati in una run.
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
    CONVERSION_STATES,
    PARKED_REASONS,
    readConversionAttempts,
    isParked,
    getConversionState,
    isEligibleForConversion,
    applyConversionAttempt,
    unparkItem,
    summarizeParkedRun
};
