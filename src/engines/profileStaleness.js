/**
 * src/engines/profileStaleness.js
 *
 * Facciata transitoria: la logica della staleness è ora posseduta da src/profile/profileStaleness.js (Ticket 41 - Fetta 1).
 * Re-esporta per compatibilità con i test e i consumatori legacy.
 */

const profileStaleness = require('../profile/profileStaleness');

module.exports = {
    PROFILE_SYNC_INTERVAL_MS: profileStaleness.PROFILE_SYNC_INTERVAL_MS,
    STREMMIO_SYNC_INTERVAL_MS: profileStaleness.STREMMIO_SYNC_INTERVAL_MS,
    isProfileSyncDue: profileStaleness.isProfileSyncDue,
    isStremioSyncDue: profileStaleness.isStremioSyncDue
};