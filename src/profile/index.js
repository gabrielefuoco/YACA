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
    studioProfile
};
