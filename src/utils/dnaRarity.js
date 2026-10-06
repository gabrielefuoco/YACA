/**
 * src/utils/dnaRarity.js
 *
 * Thin-shim di riesportazione: l'implementazione vive in `src/dna/dnaEngine.js`.
 * La cache df è **la stessa istanza** di dnaEngine, quindi l'iniezione fatta da
 * `src/db/duckDbStore.js` attraverso questo path alimenta il motore (e viceversa).
 * Il path resta per gli script e i tool esterni (ticket 22).
 */
module.exports = require('../dna/dnaEngine');
