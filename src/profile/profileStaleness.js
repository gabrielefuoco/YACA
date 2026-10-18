/**
 * src/profile/profileStaleness.js
 *
 * La regola «è ora di sincronizzare il profilo?».
 * Spostata da src/engines/profileStaleness.js nel modulo src/profile (Ticket 41 - Fetta 1).
 *
 * Riceve i dati da cui dipende la decisione e risponde sì/no, senza orologio e senza I/O.
 *
 * CONFINE INVARIATO: il sync è dovuto solo se l'età del profilo è STRETTAMENTE
 * maggiore dell'intervallo. Esattamente al confine non è ancora dovuto.
 *
 * DA QUI SI CURA ANCHE IL SYNC DELLA PARTE STREMIO (likes/loved): quella ha una
 * cadenza propria, scritta sulla configurazione a ogni sync (`lastStremioSync` +
 * `nextSyncInterval`, 8 ore ± jitter).
 */

/** Soglia di default: 12 ore. */
const PROFILE_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Intervallo di default della parte Stremio: 8 ore (il jitter lo aggiunge chi scrive). */
const STREMMIO_SYNC_INTERVAL_MS = 8 * 60 * 60 * 1000;

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

/**
 * «È ora di sincronizzare la parte Stremio (likes/loved)?»
 *
 * Decide sul SUO ultimo sync e sul SUO intervallo dichiarato, non sull'età del profilo:
 * un sync Trakt non deve rimettere in gioco la parte Stremio. Stesso confine del
 * profilo — l'età deve essere STRETTAMENTE maggiore dell'intervallo.
 *
 * @param {Date|string|number|null|undefined} lastStremioSync ultimo sync Stremio
 * @param {Date|string|number} now istante corrente
 * @param {number|null} [nextSyncInterval] intervallo dichiarato; se assente vale il default
 * @returns {boolean} true se il sync Stremio è dovuto
 */
function isStremioSyncDue(lastStremioSync, now, nextSyncInterval) {
    // Mai sincronizzato: non c'è niente di fresco, il sync è dovuto subito.
    if (lastStremioSync === null || lastStremioSync === undefined || lastStremioSync === '') return true;

    const lastMs = new Date(lastStremioSync).getTime();
    if (Number.isNaN(lastMs)) return true;

    const nowMs = new Date(now).getTime();
    if (Number.isNaN(nowMs)) return false;

    // Intervallo assente o non sensato (0, negativo, spazzatura): si torna al default,
    // così un valore corrotto non rende il sync dovuto a ogni richiesta.
    const intervalMs = (typeof nextSyncInterval === 'number' && Number.isFinite(nextSyncInterval) && nextSyncInterval > 0)
        ? nextSyncInterval
        : STREMMIO_SYNC_INTERVAL_MS;

    return (nowMs - lastMs) > intervalMs;
}

module.exports = {
    PROFILE_SYNC_INTERVAL_MS,
    STREMMIO_SYNC_INTERVAL_MS,
    isProfileSyncDue,
    isStremioSyncDue
};
