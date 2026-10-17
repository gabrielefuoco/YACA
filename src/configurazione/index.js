/**
 * Modulo Configurazione Utente (Ticket 26)
 *
 * Confine di dominio per tutto ciò che appartiene all'identità e ai segreti dell'utente:
 * - Le chiavi API (TMDB, Mistral, Stremio) e la risoluzione pura (Decisione 3)
 * - Il degrado dichiarato col motivo per assenza chiave (Decisione 4)
 * - L'account raw (`accountDi`, `accountPerAddonUuid`)
 * - Il blocco unico delle credenziali e stato Trakt (`traktDi`, `segnaTrakt*`) (Decisione 5)
 *
 * Regole di confine:
 * - La password appartiene ad Auth (UserCredentials, Decisione 1).
 * - L'UI state appartiene al Profilo (ProfileUiState, Decisione 2).
 * - Nessun file fuori da questo modulo legge direttamente `process.env.*_API_KEY` (Acceptance Grep = 0).
 * - Il client Trakt non tocca né scrive mai UserAccount: chiede sempre al modulo.
 */

const {
    SERVIZI,
    DIPENDENZE_SERVIZI,
    motivoAssenzaChiave,
    motivoDegradoFeature,
    chiaveGlobale,
    chiaveEffettiva
} = require('./chiavi');

const {
    accountDi,
    accountPerAddonUuid,
    contaAccount,
    trovaAccountPerEmailOAuthKey,
    traktDi,
    segnaTraktInRinnovo,
    segnaTraktOk,
    segnaTraktDaRiautorizzare,
    segnaTraktDegradato,
    segnaTraktNonConfigurato,
    salvaTraktCredenziali,
    disconnettiTrakt
} = require('./door');

module.exports = {
    // La porta delle chiavi
    SERVIZI,
    DIPENDENZE_SERVIZI,
    motivoAssenzaChiave,
    motivoDegradoFeature,
    chiaveGlobale,
    chiaveEffettiva,

    // La porta dell'account
    accountDi,
    accountPerAddonUuid,
    contaAccount,
    trovaAccountPerEmailOAuthKey,

    // Gestione Trakt (Decisione 5)
    traktDi,
    segnaTraktInRinnovo,
    segnaTraktOk,
    segnaTraktDaRiautorizzare,
    segnaTraktDegradato,
    segnaTraktNonConfigurato,
    salvaTraktCredenziali,
    disconnettiTrakt
};
