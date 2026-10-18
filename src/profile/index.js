/**
 * Modulo Profilo (Ticket 21 & Ticket 26)
 *
 * Confine di dominio per il contesto, l'anagrafica profili, le preferenze
 * (selettori, kidsMode, anime policy, slider Ocean), lo stato UI (ProfileUiState)
 * e le deduzioni (TasteProfile, staleness).
 *
 * Regole fondamentali del modulo:
 * 1. "La libreria fornisce fatti, il profilo deduce" (Decisione 11/16).
 * 2. Invariante «almeno uno»: `global` è un profilo reale, non un'assenza;
 *    l'ultimo profilo non può essere eliminato; i consumatori non vedono mai l'assenza.
 * 3. Il profilo è l'unico aggregato che tocca `AddonConfig.profiles[]`.
 * 4. La porta espone il profilo grezzo (`profiloDi`) e una funzione pura (`selettoriEffettivi`)
 *    per la risoluzione al bordo della richiesta.
 * 5. Lo stato UI (`raw_ui_state`) è posseduto da questo modulo via `ProfileUiState` (Decisione 2).
 * 6. Il contesto unico che scende a tutti i consumatori è prodotto da `contestoDi`.
 */

const {
    selettoriEffettivi
} = require('./selettoriEffettivi');

const {
    contestoDi,
    risolviContesto
} = require('./context');

const {
    defaultGlobalProfile,
    risolviProfiloAttivo,
    resolveActiveProfileId,
    leggiUiState,
    salvaUiState,
    selectedPresetsDi,
    profiliDi,
    profiloDi,
    creaProfilo,
    rinominaProfilo,
    duplicaProfilo,
    eliminaProfilo,
    attivaProfilo
} = require('./door');

// Deduzioni esistenti (ProfileBuilder, ProfileScorer, studioProfile)
const ProfileBuilder = require('./ProfileBuilder');
const ProfileScorer = require('./ProfileScorer');
const studioProfile = require('./studioProfile');

// Motore matematico del DNA (Ticket 49)
const dnaEngine = require('./dnaEngine');

// Ricezione DF Cache dall'indice (Dependency Inversion, Ticket 49)
try {
    const duckDbStore = require('../indice/duckDbStore');
    if (duckDbStore && typeof duckDbStore.setDfCacheConsumer === 'function') {
        duckDbStore.setDfCacheConsumer(dnaEngine.setGlobalDfCache);
    }
} catch (_e) {
    // Ambiente di test isolato o mock senza setDfCacheConsumer
}

// Staleness del profilo (Ticket 41 - Fetta 1)
const {
    PROFILE_SYNC_INTERVAL_MS,
    STREMMIO_SYNC_INTERVAL_MS,
    isProfileSyncDue,
    isStremioSyncDue
} = require('./profileStaleness');

// Deduzioni e analisi vettoriale (Ticket 41 - Fetta 1)
const {
    extractVectorByPrefix,
    computeTopElements,
    computeTopGenres,
    computeTopKeywords
} = require('./vectorElements');

// Estrazione contesto del profilo (Ticket 41 - Fetta 1)
const { fetchProfileContext, getTasteProfile, touchTasteProfile } = require('./profileContext');

// Impressioni delle raccomandazioni (Ticket 41 - Step 6)
const { recordRecommendationImpressions, registraImpressioni } = require('./impressions');

module.exports = {
    // La porta del modulo (Ticket 21 & Ticket 26)
    profiliDi,
    profiloDi,
    selettoriEffettivi,
    contestoDi,
    risolviContesto,
    risolviProfiloAttivo,
    resolveActiveProfileId,
    defaultGlobalProfile,
    fetchProfileContext,
    getTasteProfile,
    touchTasteProfile,
    recordRecommendationImpressions,
    registraImpressioni,

    // Staleness e sincronizzazione (Ticket 41)
    PROFILE_SYNC_INTERVAL_MS,
    STREMMIO_SYNC_INTERVAL_MS,
    isProfileSyncDue,
    isStremioSyncDue,

    // Analisi vettoriale e preferenze di gusto (Ticket 41)
    extractVectorByPrefix,
    computeTopElements,
    computeTopGenres,
    computeTopKeywords,

    // Gestione UI State (Ticket 26, Decisione 2)
    leggiUiState,
    salvaUiState,
    selectedPresetsDi,

    // Comandi anagrafica profili
    creaProfilo,
    rinominaProfilo,
    duplicaProfilo,
    eliminaProfilo,
    attivaProfilo,

    // Deduzioni
    ProfileBuilder,
    ProfileScorer,
    studioProfile,

    // Motore DNA (Ticket 49)
    dnaEngine,
    extractStaticDNAFromQueries: dnaEngine.extractStaticDNAFromQueries,
    extractActiveDNAFromTmdbData: dnaEngine.extractActiveDNAFromTmdbData,
    computeFinalDNA: dnaEngine.computeFinalDNA,
    computeActiveDNA: dnaEngine.computeActiveDNA,
    calculateWeightedInteractions: dnaEngine.calculateWeightedInteractions,
    calculateFlatnessMetrics: dnaEngine.calculateFlatnessMetrics,
    setGlobalDfCache: dnaEngine.setGlobalDfCache,
    getGlobalDfCache: dnaEngine.getGlobalDfCache,
    getSoftRarityMultiplier: dnaEngine.getSoftRarityMultiplier,
    applySoftRarity: dnaEngine.applySoftRarity,
    computeTimeDecay: dnaEngine.computeTimeDecay,
    normalizeVector: dnaEngine.normalizeVector
};

