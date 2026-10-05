/**
 * libraryMediaTypeResolution.js
 *
 * Risolve la scelta fra 'tv' (serie) e 'movies' (film) per un item di libreria.
 *
 * Segue la regola e l'ordine di consultazione del Ticket 12:
 * 1. Type nativo dell'item se inequivocabile:
 *    - 'movie' -> 'movie'
 *    - 'series' / 'tv' -> 'tv'
 * 2. Per item 'anime' (o con type non movie/tv):
 *    LIVELLO 1: Mappatura condivisa in memoria (Fribb / Anibridge)
 *    a) Tipo ricevuto dalla risoluzione dell'identità (identity.mediaType da Fribb)
 *    b) Prefisso esplicito nell'id dell'item o nei campi grafici (tmdb:tv:... o tmdb:movie:...)
 *    c) Mappatura condivisa in memoria (AnimeMappingStore):
 *       - da kitsu:<id> -> resolveMediaTypeFromKitsu(kitsuId)
 *       - da tmdbId -> resolveMediaTypeDaTmdbId(tmdbId), resolveKitsuMovie, tmdbToAnimeNode
 * 3. LIVELLO 4: REGOLA FONDAMENTALE DI BLOCCO: NON SI INDOVINA MAI
 *    - Se nessuna candidata fornisce una prova certa: ritorna null.
 *    - VIETATO tirare a indovinare, VIETATO fallback predefinito su movies o tv.
 */

/**
 * Risolve il media type ('tv' o 'movie') di un item di libreria.
 * Ritorna null se il tipo non è noto con certezza (NON SI INDOVINA MAI).
 *
 * @param {Object} item L'item di libreria da esaminare
 * @param {Object} [deps] Dipendenze opzionali: { identity, mappingStore, tmdbId }
 * @returns {'tv'|'movie'|null}
 */
function resolveItemMediaType(item, deps = {}) {
    if (!item) return null;
    const { identity, mappingStore, tmdbId: explicitTmdbId } = deps || {};

    const rawType = String(item.type || '').trim().toLowerCase();

    // 1. Type nativo se inequivocabile
    if (rawType === 'movie') return 'movie';
    if (rawType === 'series' || rawType === 'tv') return 'tv';

    // 2. Per item anime (o type ambiguo):
    // A) Mappatura Fribb / risoluzione identità a monte
    if (identity?.mediaType === 'tv' || identity?.mediaType === 'movie') {
        return identity.mediaType;
    }

    // B) Prefisso esplicito nell'itemId o nei campi grafici Stremio
    const strId = String(item.itemId || item._id || '').trim();
    if (strId.startsWith('tmdb:tv:')) return 'tv';
    if (strId.startsWith('tmdb:movie:')) return 'movie';

    for (const field of [item.poster, item.logo, item.background]) {
        const val = String(field || '');
        if (val.includes('tmdb:tv:')) return 'tv';
        if (val.includes('tmdb:movie:')) return 'movie';
    }

    // C) Consultazione mappatura condivisa in memoria (Livello 1: Anibridge + Fribb)
    if (mappingStore) {
        // Se l'item è un kitsu:<id>
        if (strId.startsWith('kitsu:')) {
            const kitsuId = strId.slice('kitsu:'.length).trim();
            if (typeof mappingStore.resolveMediaTypeFromKitsu === 'function') {
                const kitsuType = mappingStore.resolveMediaTypeFromKitsu(kitsuId);
                if (kitsuType === 'tv' || kitsuType === 'movie') return kitsuType;
            }
        }

        // Se abbiamo un TMDB ID (dall'item o risolto dall'identità)
        const effectiveTmdbId = explicitTmdbId || identity?.tmdbId || item.tmdbId;
        if (effectiveTmdbId) {
            const cleanId = String(effectiveTmdbId).replace(/^tmdb:(tv:|movie:)?/i, '').split(':')[0].trim();
            if (cleanId) {
                if (typeof mappingStore.resolveMediaTypeDaTmdbId === 'function') {
                    const daTmdb = mappingStore.resolveMediaTypeDaTmdbId(cleanId);
                    if (daTmdb === 'tv' || daTmdb === 'movie') return daTmdb;
                }
                if (typeof mappingStore.resolveKitsuMovie === 'function' && mappingStore.resolveKitsuMovie(cleanId)) {
                    return 'movie';
                }
                if (mappingStore.tmdbToAnimeNode?.has(cleanId + ':1') || mappingStore.anibridgeShowTmdbIds?.has(cleanId)) {
                    return 'tv';
                }
                if (mappingStore.anibridgeMovieTmdbIds?.has(cleanId)) {
                    return 'movie';
                }
            }
        }
    }

    // LIVELLO 4: REGOLA FONDAMENTALE DI BLOCCO: NON SI INDOVINA MAI
    return null;
}

/**
 * Restituisce la tabella DuckDB e l'endpoint TMDB corretti in base al media type.
 * Se il tipo è null, restituisce { table: null, endpoint: null } (non si interroga nulla).
 *
 * @param {'tv'|'movie'|null} mediaType
 * @param {string|number} tmdbId
 * @returns {{table: 'tv'|'movies'|null, endpoint: string|null}}
 */
function resolveTargetTableAndEndpoint(mediaType, tmdbId) {
    if (!tmdbId || (mediaType !== 'tv' && mediaType !== 'movie')) {
        return { table: null, endpoint: null };
    }
    const cleanId = String(tmdbId).replace(/^tmdb:(tv:|movie:)?/i, '').split(':')[0].trim();
    if (mediaType === 'tv') {
        return { table: 'tv', endpoint: `/tv/${cleanId}` };
    }
    return { table: 'movies', endpoint: `/movie/${cleanId}` };
}

module.exports = {
    resolveItemMediaType,
    resolveTargetTableAndEndpoint
};
