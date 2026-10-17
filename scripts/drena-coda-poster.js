#!/usr/bin/env node
/**
 * drena-coda-poster.js — shim CLI per il comando di drenaggio della coda dei poster.
 *
 * Il comando vive nel modulo poster (`src/posters/drenaCodaPoster.js`).
 * Questo script mantiene la compatibilità per i chiamanti esterni, i timer e i test.
 */

const drenaCodaPoster = require('../src/posters/drenaCodaPoster');

if (require.main === module) {
    const watchdog = setTimeout(() => process.exit(process.exitCode || 0), drenaCodaPoster.DEFAULT_TIMEOUT_GIRO_MS);
    watchdog.unref();

    drenaCodaPoster.main().then((codice) => { process.exitCode = codice; });
}

module.exports = drenaCodaPoster;