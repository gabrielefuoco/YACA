/**
 * libraryIdentityResolution.js
 *
 * «Da questo id di item, quale TMDB id?» — il passo che il ciclo di conversione
 * faceva inline, tra due `startsWith` e una chiamata a TMDB. Qui è una funzione
 * alimentata dalle sue dipendenze (la ricerca esterna, e in futuro la mappatura
 * Kitsu→TMDB), quindi verificabile senza rete e senza database.
 *
 * Comportamento identico a quello di sempre: `tt…` si risolve con la ricerca
 * esterna, `tmdb:…` si prende diretto. `kitsu:…` resta non risolto — quel ramo
 * lo apre il ticket 03, e finché non c'è la funzione lo dice apertamente invece
 * di fingere di aver risolto.
 *
 * Motivi (stabili: finiscono nei log e nei test):
 *   - `search-hit`      un `tt…` trovato dalla ricerca esterna
 *   - `prefix`          un `tmdb:…` letto direttamente dall'id
 *   - `not-found`       l'id è riconosciuto ma oggi non si risolve
 *   - `unsupported`     l'id non è di una fonte che il ciclo sa risolvere
 */

/** Motivi della risoluzione, in costanti per evitare stringhe sparse nei test e nei log. */
const RESOLUTION_REASONS = Object.freeze({
    FOUND_VIA_SEARCH: 'search-hit',
    FROM_PREFIX: 'prefix',
    NOT_FOUND: 'not-found',
    UNSUPPORTED_SOURCE: 'unsupported'
});

/** Prefissi che il ciclo sa risolvere da solo, senza interrogare nulla. */
const IMDB_PREFIX = 'tt';
const TMDB_PREFIX = 'tmdb:';

/**
 * Risolve il TMDB id di un item.
 *
 * @param {string|null|undefined} rawId id dell'item (`tt…`, `tmdb:…`, `kitsu:…`, …)
 * @param {{lookupImdbId?: (imdbId: string) => Promise<{id: number|string, [k: string]: any}|null>}} [deps]
 * @returns {Promise<{resolved: boolean, tmdbId: number|string|null, tmdbData: object|null, reason: string}>}
 */
async function resolveTmdbIdentity(rawId, deps = {}) {
    const { lookupImdbId } = deps || {};
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

    // `kitsu:` e tutto il resto: fonti che il ciclo ancora non sa risolvere.
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
