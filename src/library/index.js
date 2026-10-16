/**
 * Modulo Libreria (Ticket 15)
 *
 * Confine di dominio per la libreria dell'utente (watchlist, storico, like, love).
 *
 * Regole fondamentali del modulo:
 * 1. "La libreria fornisce fatti, il profilo deduce": i fatti su visioni, liste e
 *    identità dei titoli appartengono alla libreria. Pesi DNA e TasteProfile al profilo.
 * 2. "Se serve a decidere cosa mostrare, non è della libreria".
 * 3. "Un profilo mai sincronizzato resta freddo": se non vi è alcuna cronologia reale
 *    per il profilo, la libreria d'account non viene interrogata per i semi.
 */

const {
    semiDi,
    collectRealSeeds,
    profiloHaCronologiaReale,
    risolviAddonUuid,
    SEED_SIGNAL_WEIGHTS,
    SEED_SIGNAL_LIMITS,
    toSeedMediaType,
    normalizeSeedId,
    getSeedTimestamp,
    keepMostRecentSeed
} = require('./seeds');

const {
    WATCHLIST_PAGE_SIZE,
    leggiWatchlist,
    leggiTitolo,
    trovaItemLibreria,
    salvaItemLibreria,
    marcaRimossoLibreria,
    leggiLibreria,
    contaDaConvertire,
    storiaDi,
    cronologiaDi,
    registraVisione,
    backfillCronologia,
    trovaCronologiaPerIds,
    scriviBatchCronologia,
    leggiItemPerStudi,
    leggiLibreriaPerProfilo,
    ensureLibraryIndexesSafe
} = require('./reader');

const identity = require('./identity');

module.exports = {
    // Porta di lettura semi pesati
    semiDi,
    collectRealSeeds,
    profiloHaCronologiaReale,
    risolviAddonUuid,
    SEED_SIGNAL_WEIGHTS,
    SEED_SIGNAL_LIMITS,
    toSeedMediaType,
    normalizeSeedId,
    getSeedTimestamp,
    keepMostRecentSeed,

    // Porta di lettura e gestione libreria / watchlist / cronologia
    WATCHLIST_PAGE_SIZE,
    leggiWatchlist,
    leggiTitolo,
    trovaItemLibreria,
    salvaItemLibreria,
    marcaRimossoLibreria,
    leggiLibreria,
    contaDaConvertire,
    storiaDi,
    cronologiaDi,
    registraVisione,
    backfillCronologia,
    trovaCronologiaPerIds,
    scriviBatchCronologia,
    leggiItemPerStudi,
    leggiLibreriaPerProfilo,
    ensureLibraryIndexesSafe,

    // Regole d'identità di dominio (delega dinamica a identity per preservare spy/mock)
    normalizeLibraryId: (...args) => identity.normalizeLibraryId(...args),
    normalizeTitle: (...args) => identity.normalizeTitle(...args),
    normalizeLegacyPosterHost: (...args) => identity.normalizeLegacyPosterHost(...args),
    resolveCanonicalKeys: (...args) => identity.resolveCanonicalKeys(...args),
    planDuplicateMarks: (...args) => identity.planDuplicateMarks(...args),
    applyDuplicateMarks: (...args) => identity.applyDuplicateMarks(...args),
    get LEGACY_APP_HOSTS() { return identity.LEGACY_APP_HOSTS; },
    identity
};
