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
    },
    // Letture del modello ImdbToTmdbMapping: il modello appartiene a questo modulo (idMapping).
    // Gli altri moduli (library, posters) leggono da qui, non dal modello (map §16).
    lookupImdbToTmdb: (...a) => require('./idMapping').lookupImdbToTmdb(...a),
    lookupImdbToTmdbBatch: (...a) => require('./idMapping').lookupImdbToTmdbBatch(...a),
    get graphClient() {
        return require('./graphClient');
    }
};

