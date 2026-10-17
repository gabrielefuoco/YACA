/**
 * src/posters/index.js — Modulo Poster di YACA.
 *
 * Il quarto dei nuovi moduli di dominio accanto a profilo, ricerca, catalogo, indice, cache.
 *
 * Possiede:
 * 1. Il mapping ERDB name <-> id e i file composti (sotto-namespace `erdb/` e funzioni pure di composizione)
 * 2. La coda degli eventi di rigenerazione poster (`codaEventi`, `push`, `take`, `done`, `fail`)
 * 3. Il drenatore della coda (`drena`, `scarica`, `scrivi`, `classificaMotivo`, ecc.)
 * 4. Il comando di drenaggio eseguibile da timer di sistema (`drenaCodaPoster`, `drenaCommand`)
 */

const codaEventi = require('./codaEventi');
const drenaPoster = require('./drenaPoster');
const posterDaEvento = require('./posterDaEvento');
const erdb = require('./erdb');
const drenaCodaPoster = require('./drenaCodaPoster');

module.exports = {
    // 1. Coda eventi
    codaEventi,
    createCodaEventi: codaEventi.createCodaEventi,
    push: codaEventi.push,
    take: codaEventi.take,
    done: codaEventi.done,
    fail: codaEventi.fail,
    MAX_TENTATIVI: codaEventi.MAX_TENTATIVI,
    TTL_SECONDS: codaEventi.TTL_SECONDS,

    // 2. Drenatore (funzione)
    drena: drenaPoster.drena,
    scarica: drenaPoster.scarica,
    scrivi: drenaPoster.scrivi,
    classificaMotivo: drenaPoster.classificaMotivo,
    eventoDaErdbId: drenaPoster.eventoDaErdbId,
    eJpeg: drenaPoster.eJpeg,
    DEFAULT_BATCH: drenaPoster.DEFAULT_BATCH,
    DEFAULT_TIMEOUT_MS: drenaPoster.DEFAULT_TIMEOUT_MS,

    // 3. Traduzione eventi <-> nomi file / id ERDB
    erdbIdDaEvento: posterDaEvento.erdbIdDaEvento,
    erdbIdDaNomeFile: posterDaEvento.erdbIdDaNomeFile,
    erdbIdsDaEvento: posterDaEvento.erdbIdsDaEvento,
    eventoDaNomeFile: posterDaEvento.eventoDaNomeFile,
    nomeFileDaEvento: posterDaEvento.nomeFileDaEvento,
    urlDaEvento: posterDaEvento.urlDaEvento,

    // 4. ERDB composition & builder
    posterFileName: erdb.posterFileName,
    posterUrl: erdb.posterUrl,
    sanitizeErdbId: erdb.sanitizeErdbId,
    sanitizePart: erdb.sanitizePart,
    isReusable: erdb.isReusable,
    isUsableImage: erdb.isUsableImage,
    normalizeEntry: erdb.normalizeEntry,
    parseJsonl: erdb.parseJsonl,
    buildReport: erdb.buildReport,
    run: erdb.run,
    erdb,

    // 5. Drenatore (comando da timer esterno)
    drenaCodaPoster,
    drenaCommand: drenaCodaPoster.main,

    // 6. Cartella cache poster (proprietà del modulo)
    DEFAULT_CACHE_DIR: drenaCodaPoster.DEFAULT_CACHE_DIR,
    getCacheDir: drenaCodaPoster.getCacheDir
};
