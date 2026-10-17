/**
 * src/configurazione/chiavi.js
 *
 * Gestione centralizzata e pura delle chiavi API e del degrado (Ticket 26 - Decisioni 3 e 4).
 *
 * La porta delle chiavi offre:
 * 1. `chiaveEffettiva({ account, servizio, richiesta, env })`: funzione pura con precedenza:
 *    richiesta -> account.apiKeys[servizio] -> process.env -> null
 * 2. `chiaveGlobale(servizio)`: per i lavori offline/batch (daemon, name resolver, conversione)
 * 3. Mappa centralizzata delle dipendenze funzionali e dei motivi di degrado dichiarati.
 */

const SERVIZI = Object.freeze({
    TMDB: 'tmdb',
    MISTRAL: 'mistral',
    STREMIO: 'stremio',
    TRAKT: 'trakt'
});

/**
 * Mappa unica delle feature che dipendono da un servizio esterno (Decisione 4).
 * Quando una chiave manca, il chiamante degrada dichiarando il motivo esplicito.
 */
const DIPENDENZE_SERVIZI = Object.freeze({
    ricerca_semantica: SERVIZI.MISTRAL,
    cataloghi_ai: SERVIZI.MISTRAL,
    fusione_nomi_cataloghi: SERVIZI.MISTRAL,
    ricerca_tmdb: SERVIZI.TMDB,
    ricerca_keyword: SERVIZI.TMDB,
    ricerca_persona: SERVIZI.TMDB,
    arricchimento_metadati: SERVIZI.TMDB,
    daemon_dump_tmdb: SERVIZI.TMDB,
    conversione_libreria: SERVIZI.TMDB
});

/**
 * Restituisce il motivo standardizzato di degrado per assenza chiave.
 * Esempio: 'mistral' -> 'chiave_mistral_assente'
 *
 * @param {string} servizio
 * @returns {string}
 */
function motivoAssenzaChiave(servizio) {
    const s = String(servizio || '').toLowerCase().trim();
    return `chiave_${s || 'sconosciuta'}_assente`;
}

/**
 * Restituisce il motivo di degrado associato a una specifica feature.
 *
 * @param {string} feature
 * @returns {string}
 */
function motivoDegradoFeature(feature) {
    const serv = DIPENDENZE_SERVIZI[feature];
    return motivoAssenzaChiave(serv || feature);
}

/**
 * Legge la chiave globale di sistema da process.env per i lavori offline.
 * È l'UNICO punto dell'intera applicazione autorizzato a leggere le API key da process.env.
 *
 * @param {string} servizio - 'tmdb' | 'mistral' | 'stremio' | 'trakt'
 * @returns {string|null}
 */
function chiaveGlobale(servizio) {
    if (!servizio) return null;
    const s = String(servizio).toLowerCase().trim();
    if (s === 'tmdb') {
        return process.env.TMDB_API_KEY || null;
    }
    if (s === 'mistral') {
        return process.env.MISTRAL_API_KEY || null;
    }
    return null;
}

/**
 * Risolve la chiave effettiva in modo PURO.
 * Precedenza rigorosa (Ticket 26, Decisione 3):
 *   richiesta (override per-request)
 *     -> account.apiKeys[servizio] (chiave utente salvata)
 *       -> process.env (chiave globale server)
 *         -> null
 *
 * @param {Object} params
 * @param {Object} [params.account] - Documento o oggetto account dell'utente
 * @param {string} params.servizio - 'tmdb' | 'mistral' | 'stremio' | 'trakt'
 * @param {string} [params.richiesta] - Chiave opzionale passata nella specifica richiesta
 * @param {Object} [params.env] - Iniezione opzionale variabili ambiente (default: process.env)
 * @returns {string|null}
 */
function chiaveEffettiva({ account = null, servizio = '', richiesta = null, env = process.env } = {}) {
    if (!servizio) return null;
    const s = String(servizio).toLowerCase().trim();

    // 1. Override esplicito nella richiesta
    if (richiesta && typeof richiesta === 'string') {
        const trimmed = richiesta.trim();
        if (trimmed.length > 0 && trimmed !== 'null' && trimmed !== 'undefined') {
            return trimmed;
        }
    }

    // 2. Chiave memorizzata nell'account utente
    const userKeys = account?.apiKeys || {};
    let userKey = userKeys[s];
    if (!userKey && s === 'trakt') {
        userKey = account?.trakt?.accessToken || userKeys.trakt;
    }
    if (userKey && typeof userKey === 'string') {
        const trimmedUser = userKey.trim();
        if (trimmedUser.length > 0 && trimmedUser !== 'null' && trimmedUser !== 'undefined') {
            return trimmedUser;
        }
    }

    // 3. Chiave globale da ambiente
    if (s === 'tmdb') {
        const globalTmdb = env?.TMDB_API_KEY;
        if (globalTmdb && typeof globalTmdb === 'string' && globalTmdb.trim().length > 0) {
            return globalTmdb.trim();
        }
    } else if (s === 'mistral') {
        const globalMistral = env?.MISTRAL_API_KEY;
        if (globalMistral && typeof globalMistral === 'string' && globalMistral.trim().length > 0) {
            return globalMistral.trim();
        }
    }

    // 4. Nessuna chiave disponibile
    return null;
}

module.exports = {
    SERVIZI,
    DIPENDENZE_SERVIZI,
    motivoAssenzaChiave,
    motivoDegradoFeature,
    chiaveGlobale,
    chiaveEffettiva
};
