/**
 * REGOLA ARCHITETTURALE (Ticket 11): Il client nomina solo il dominio.
 *
 * La sincronizzazione in background e l'arricchimento dei metadati sono stati assorbiti
 * interamente dal server (TmdbDumpDaemon e POST /api/profilo/sincronizzazione).
 * Il client non orchestra code globali né chiama rotte infrastrutturali (/api/sync/*).
 */
export function useBackgroundSync(_globalTmdbKey?: string, _userId?: string) {
    // No-op: il server governa autonomamente la sincronizzazione e la persistenza.
}
