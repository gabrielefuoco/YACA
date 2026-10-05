/**
 * La regola «è ora di sincronizzare il profilo?».
 *
 * Era calcolata dentro `getHybridCatalog`, in mezzo alla costruzione del catalogo:
 * impossibile da verificare da sola, e il confine (12 ore) finiva confuso con la
 * soglia che cambia a ogni chiamata. Qui è isolata in una funzione pura: riceve i
 * tre dati che la decisione dipende e risponde sì/no, senza orologio e senza I/O.
 *
 * CONFINE INVARIATO: il sync è dovuto solo se l'età del profilo è STRETAMENTE
 * maggiore dell'intervallo. Esattamente al confine non è ancora dovuto.
 */

/** Soglia di oggi: 12 ore. */
const PROFILE_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * @param {Date|string|number|null|undefined} lastUpdated ultimo aggiornamento del profilo
 * @param {Date|string|number} now istante corrente
 * @param {number} [intervalMs] intervallo oltre il quale il sync è dovuto
 * @returns {boolean} true se il sync del profilo è dovuto
 */
function isProfileSyncDue(lastUpdated, now, intervalMs = PROFILE_SYNC_INTERVAL_MS) {
    // Mai aggiornato: non c'è niente di fresco da usare, il sync è dovuto subito.
    if (lastUpdated === null || lastUpdated === undefined || lastUpdated === '') return true;

    const lastMs = new Date(lastUpdated).getTime();
    if (Number.isNaN(lastMs)) return true;

    const nowMs = new Date(now).getTime();
    if (Number.isNaN(nowMs)) return false;

    return (nowMs - lastMs) > intervalMs;
}

module.exports = {
    PROFILE_SYNC_INTERVAL_MS,
    isProfileSyncDue
};