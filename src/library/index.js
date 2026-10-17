/**
 * Modulo Libreria (Ticket 15 & Ticket 16)
 *
 * Confine di dominio per la libreria dell'utente (watchlist, storico, like, love, ingestione).
 *
 * Regole fondamentali del modulo:
 * 1. "La libreria fornisce fatti, il profilo deduce": i fatti su visioni, liste e
 *    identità dei titoli appartengono alla libreria. Pesi DNA e TasteProfile al profilo.
 * 2. "Se serve a decidere cosa mostrare, non è della libreria".
 * 3. "Un profilo mai sincronizzato resta freddo": se non vi è alcuna cronologia reale
 *    per il profilo, la libreria d'account non viene interrogata per i semi.
 * 4. "Il contesto della libreria è tre chiavi: { userId, profileId, addonUuid }":
 *    isolato nel resolver unico resolveLibraryContext (Emendamento 3).
 * 5. "La macchina a stati della conversione è dichiarata formalmente in conversionStateMachine" (Ticket 16).
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
const { resolveLibraryContext, risolviContestoLibreria } = require('./context');

// Ingestion services & state machine (Ticket 16)
const LibrarySyncService = require('./ingestion/LibrarySyncService');
const LibraryConverterService = require('./ingestion/LibraryConverterService');
const libraryWatchedService = require('./ingestion/libraryWatchedService');
const libraryMediaTypeResolution = require('./ingestion/libraryMediaTypeResolution');
const libraryIdentityResolution = require('./ingestion/libraryIdentityResolution');
const conversionStateMachine = require('./ingestion/conversionStateMachine');
const libraryConversionAdmission = require('./ingestion/libraryConversionAdmission');
const libraryConversionOutcome = require('./ingestion/libraryConversionOutcome');

/**
 * Write path unificato per la sincronizzazione dei dati Stremio nella libreria e cronologia (Ticket 16, Emendamento 2).
 *
 * Riceve i dati scaricati da Stremio (liked, loved, library) e li registra nella cronologia (WatchHistory)
 * e nella libreria dell'account (UserLibraryItem), isolando l'accesso attraverso il contesto { userId, profileId, addonUuid }.
 *
 * @param {{userId: string, profileId?: string, addonUuid?: string, stremioData: object}} params
 * @returns {Promise<{success: boolean, context?: object, error?: string}>}
 */
async function ingestStremioData({ userId, profileId = 'global', addonUuid, stremioData } = {}) {
    const context = await resolveLibraryContext({ userId, profileId, addonUuid });
    if (!context.userId || !stremioData) {
        return { success: false, error: 'Parametri insufficienti per ingestStremioData' };
    }

    // 1. Ingestione cronologia (WatchHistory + fan-out + ricalcolo DNA)
    const ProfileBuilder = require('../profile/ProfileBuilder');
    await ProfileBuilder.syncStremioData(context.userId, stremioData, context.profileId);

    // 2. Se abbiamo addonUuid e stremioData.library, aggiorna anche la libreria UserLibraryItem
    if (context.addonUuid && Array.isArray(stremioData.library) && stremioData.library.length > 0) {
        await LibrarySyncService.syncLibraryForUser(context.userId).catch(err => {
            console.warn('[LibraryModule] syncLibraryForUser durante ingestStremioData non-fatale:', err.message);
        });
    }

    return { success: true, context };
}

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
    identity,

    // Risoluzione Contesto Libreria a 3 chiavi (Ticket 16, Emendamento 3)
    resolveLibraryContext,
    risolviContestoLibreria,

    // Scrittore Stremio fuori da qualsiasi lista (Ticket 16, Emendamento 2)
    ingestStremioData,

    // Servizi di Ingestione (Ticket 16)
    LibrarySyncService,
    LibraryConverterService,
    syncLibraryForUser: (...args) => LibrarySyncService.syncLibraryForUser(...args),
    convertAll: (...args) => LibraryConverterService.convertAll(...args),
    convertLibraryForUser: (...args) => LibraryConverterService.convertAll(...args),
    previewWatchedLibrary: (...args) => libraryWatchedService.previewWatchedLibrary(...args),
    removeWatchedLibrary: (...args) => libraryWatchedService.removeWatchedLibrary(...args),
    findWatchedItems: (...args) => libraryWatchedService.findWatchedItems(...args),
    isItemWatched: (...args) => libraryWatchedService.isItemWatched(...args),
    resolveItemMediaType: (...args) => libraryMediaTypeResolution.resolveItemMediaType(...args),
    resolveTmdbIdentity: (...args) => libraryIdentityResolution.resolveTmdbIdentity(...args),

    // Macchina a stati di conversione dichiarata (Ticket 16)
    CONVERSION_STATES: conversionStateMachine.CONVERSION_STATES,
    MAX_CONVERSION_ATTEMPTS: conversionStateMachine.MAX_CONVERSION_ATTEMPTS,
    PARKED_REASONS: conversionStateMachine.PARKED_REASONS,
    getConversionState: conversionStateMachine.getConversionState,
    isParked: conversionStateMachine.isParked,
    readConversionAttempts: conversionStateMachine.readConversionAttempts,
    isEligibleForConversion: conversionStateMachine.isEligibleForConversion,
    applyConversionAttempt: conversionStateMachine.applyConversionAttempt,
    unparkItem: conversionStateMachine.unparkItem,
    summarizeParkedRun: conversionStateMachine.summarizeParkedRun,
    evaluateConversionAdmission: libraryConversionAdmission.evaluateConversionAdmission,
    selectConvertibleItems: libraryConversionAdmission.selectConvertibleItems,
    decideConversionOutcome: libraryConversionOutcome.decideConversionOutcome,
    applyConversionOutcome: libraryConversionOutcome.applyConversionOutcome,
    buildConversionState: libraryConversionOutcome.buildConversionState,
    summarizeUnresolvedRun: libraryConversionOutcome.summarizeUnresolvedRun,
    conversionStateMachine,

    // Ingestion namespace completo
    ingestion: {
        LibrarySyncService,
        LibraryConverterService,
        libraryWatchedService,
        libraryMediaTypeResolution,
        libraryIdentityResolution,
        conversionStateMachine,
        libraryConversionAdmission,
        libraryConversionOutcome
    }
};
