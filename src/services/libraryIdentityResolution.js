/**
 * libraryIdentityResolution.js
 *
 * «Da questo id di item, quale TMDB id?» — il passo che il ciclo di conversione
 * faceva inline, tra due `startsWith` e una chiamata a TMDB. Qui è una funzione
 * alimentata dalle sue dipendenze (la ricerca esterna, e in futuro la mappatura
 * Kitsu→TMDB), quindi verificabile senza rete e senza database.
 *
 * Comportamento: `tt…` si risolve con la ricerca esterna, `tmdb:…` si prende
 * diretto, `kitsu:…` si risolve con la mappatura Kitsu→TMDB che l'app già tiene in
 * memoria (Anibridge + Fribb, ~8.2k chiavi) — nessuna rete per questa strada: la
 * mappa la tiene `animeMappingStore` e si aggiorna da sola.
 *
 * Motivi (stabili: finiscono nei log e nei test):
 *   - `search-hit`      un `tt…` trovato dalla ricerca esterna
 *   - `prefix`          un `tmdb:…` letto direttamente dall'id
 *   - `kitsu-map`       un `kitsu:…` presente nella mappatura condivisa
 *   - `not-found`       l'id è riconosciuto ma non si risolve
 *   - `unsupported`     l'id non è di una fonte che il ciclo sa risolvere
 */

/** Motivi della risoluzione, in costanti per evitare stringhe sparse nei test e nei log. */
const RESOLUTION_REASONS = Object.freeze({
    FOUND_VIA_SEARCH: 'search-hit',
    FROM_PREFIX: 'prefix',
    FOUND_VIA_KITSU_MAP: 'kitsu-map',
    NOT_FOUND: 'not-found',
    UNSUPPORTED_SOURCE: 'unsupported'
});

/** Prefissi che il ciclo sa risolvere da solo, senza interrogare nulla. */
const IMDB_PREFIX = 'tt';
const TMDB_PREFIX = 'tmdb:';
const KITSU_PREFIX = 'kitsu:';

/**
 * Risolve il TMDB id di un item.
 *
 * @param {string|null|undefined} rawId id dell'item (`tt…`, `tmdb:…`, `kitsu:…`, …)
 * @param {{
 *   lookupImdbId?: (imdbId: string) => Promise<{id: number|string, [k: string]: any}|null>,
 *   lookupKitsuId?: (kitsuId: string) => string|number|null|Promise<string|number|null>
 * }} [deps] `lookupKitsuId` legge la mappatura condivisa già in memoria: nessuna
 *   rete, nessuna nuova fonte di dati. Se non è fornita, `kitsu:…` resta «fonte non
 *   gestita» — cioè la funzione non finge di saperla risolvere senza mappa.
 * @returns {Promise<{resolved: boolean, tmdbId: number|string|null, tmdbData: object|null, reason: string}>}
 */
async function resolveTmdbIdentity(rawId, deps = {}) {
    const { lookupImdbId, lookupKitsuId } = deps || {};
    const strId = rawId === null || rawId === undefined ? '' : String(rawId);

    if (strId.startsWith(TMDB_PREFIX)) {
        const tmdbId = strId.slice(TMDB_PREFIX.length);
        return tmdbId
            ? { resolved: true, tmdbId, tmdbData: null, reason: RESOLUTION_REASONS.FROM_PREFIX }
            : notResolved(RESOLUTION_REASONS.UNSUPPORTED_SOURCE);
    }

    if (strId.startsWith(IMDB_PREFIX)) {
        if (typeof lookupImdbId !== 'function') {
            return notResolved(RESOLUTION_REASONS.NOT_FOUND);
        }
        try {
            const found = await lookupImdbId(strId);
            if (found && (found.id !== undefined && found.id !== null)) {
                return {
                    resolved: true,
                    tmdbId: found.id,
                    tmdbData: found,
                    reason: RESOLUTION_REASONS.FOUND_VIA_SEARCH
                };
            }
        } catch (_err) {
            // La ricerca esterna che fallisce non è un errore di conversione: l'item
            // resta semplicemente non risolto, e il ciclo continua con il fallback.
        }
        return notResolved(RESOLUTION_REASONS.NOT_FOUND);
    }

    if (strId.startsWith(KITSU_PREFIX)) {
        const kitsuId = strId.slice(KITSU_PREFIX.length).trim();
        if (!kitsuId) {
            return notResolved(RESOLUTION_REASONS.UNSUPPORTED_SOURCE);
        }
        if (typeof lookupKitsuId !== 'function') {
            return notResolved(RESOLUTION_REASONS.UNSUPPORTED_SOURCE);
        }
        let tmdbId;
        let mediaType = null;
        try {
            const rawMapped = await lookupKitsuId(kitsuId);
            if (rawMapped && typeof rawMapped === 'object') {
                tmdbId = rawMapped.tmdbId !== undefined ? rawMapped.tmdbId : null;
                mediaType = rawMapped.type || rawMapped.mediaType || null;
            } else {
                tmdbId = rawMapped;
            }
        } catch (_err) {
            // Mappa non pronta o guasta: l'item resta semplicemente non risolto e
            // torna eleggibile al giro dopo (la mappa si aggiorna da sola).
            tmdbId = null;
            mediaType = null;
        }
        if (tmdbId !== null && tmdbId !== undefined && tmdbId !== '') {
            const result = { resolved: true, tmdbId, tmdbData: null, reason: RESOLUTION_REASONS.FOUND_VIA_KITSU_MAP };
            if (mediaType) {
                result.mediaType = mediaType;
            }
            return result;
        }
        return notResolved(RESOLUTION_REASONS.NOT_FOUND);
    }

    // tutto il resto: fonti che il ciclo ancora non sa risolvere.
    return notResolved(RESOLUTION_REASONS.UNSUPPORTED_SOURCE);
}

/** Verdetto di «non risolto adesso», con il motivo al posto del TMDB id. */
function notResolved(reason) {
    return { resolved: false, tmdbId: null, tmdbData: null, reason };
}

module.exports = {
    RESOLUTION_REASONS,
    resolveTmdbIdentity
};
