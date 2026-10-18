/**
 * src/clients/index.js
 *
 * Porta del modulo clients (Ticket 52 - Adattatori verso l'esterno).
 * Espone la traduzione e il mapping id per i consumatori esterni.
 */

module.exports = {
    get translateImdbToTmdb() {
        return require('./idMapping').translateImdbToTmdb;
    },
    get clearIdCache() {
        return require('./idMapping').clearIdCache;
    }
};
