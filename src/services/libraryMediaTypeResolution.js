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

let duckDbStore = null;
try {
    duckDbStore = require('../db/duckDbStore');
} catch (_e) {
    duckDbStore = null;
}

const unresolvedTypeLog = [];
const MAX_UNRESOLVED_LOG = 500;

/**
 * Traccia un item il cui tipo non è stato possibile risolvere con certezza.
 * Le discordanze e le ambiguità vanno tracciate, mai nascoste né indovinate.
 *
 * @param {Object} item
 * @param {string} reason
 * @returns {Object}
 */
function trackUnresolvedType(item, reason) {
    const entry = {
        itemId: item?.itemId || item?._id || item?.id || 'unknown',
        name: item?.name || '',
        rawType: item?.type || '',
        reason: String(reason || 'Tipo non risolvibile'),
        timestamp: new Date()
    };
    unresolvedTypeLog.push(entry);
    // Tetto: il log è diagnostico, non un accumulatore. Senza questo, un processo
    // long-running che sincronizza spesso crescerebbe senza limite (un item non
    // risolvibile per sync ⇒ una voce in RAM per sempre).
    if (unresolvedTypeLog.length > MAX_UNRESOLVED_LOG) unresolvedTypeLog.shift();
    console.warn(`[MediaTypeResolution] Tipo non risolvibile per ${entry.itemId} (${entry.name || 'senza nome'}): ${entry.reason}`);
    return entry;
}

function getUnresolvedTypeLog() {
    return [...unresolvedTypeLog];
}

function clearUnresolvedTypeLog() {
    unresolvedTypeLog.length = 0;
}

/**
 * Risolve il media type ('tv' o 'movie') di un item di libreria.
 * Ritorna null se il tipo non è noto con certezza (NON SI INDOVINA MAI).
 *
 * @param {Object} item L'item di libreria da esaminare
 * @param {Object} [deps] Dipendenze opzionali: { identity, mappingStore, tmdbId, movieRows, tvRows }
 * @returns {'tv'|'movie'|null}
 */
function resolveItemMediaType(item, deps = {}) {
    if (!item) {
        trackUnresolvedType(item, 'Item assente o nullo');
        return null;
    }
    const { identity, mappingStore, tmdbId: explicitTmdbId, movieRows, tvRows } = deps || {};

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

    // D) Consultazione righe DB passate in deps sincrone se presenti
    if (Array.isArray(movieRows) || Array.isArray(tvRows)) {
        const inMovies = Boolean(movieRows && movieRows.length > 0);
        const inTv = Boolean(tvRows && tvRows.length > 0);
        if (inMovies && !inTv) return 'movie';
        if (inTv && !inMovies) return 'tv';
        if (inMovies && inTv) {
            trackUnresolvedType(item, 'Collisione DB sincrona: presente sia in movies che in tv');
            return null;
        }
    }

    // LIVELLO 4: REGOLA FONDAMENTALE DI BLOCCO: NON SI INDOVINA MAI
    trackUnresolvedType(item, 'Tipo non risolvibile: nessuna prova certa da mapping/identità/artwork');
    return null;
}

/**
 * Risolve il media type consultando direttamente il database DuckDB (tabelle movies e tv).
 * Il DB è la legge sul tipo: se una serie o un film è classificato come tale nel DB,
 * quello è il suo tipo canonico. Se compare in entrambe le tabelle o in nessuna,
 * non si indovina e l'anomalia viene tracciata.
 *
 * @param {Object} item
 * @param {Object} [deps] Dipendenze: { duckDbStore, mappingStore, identity, tmdbId }
 * @returns {Promise<'tv'|'movie'|null>}
 */
async function resolveMediaTypeFromDb(item, deps = {}) {
    if (!item) {
        trackUnresolvedType(item, 'Item assente o nullo');
        return null;
    }

    // 1. Prova prima la risoluzione sincrona (tipo certo, mappingStore, identity)
    const syncType = resolveItemMediaType(item, deps);
    if (syncType) return syncType;

    // 2. Interrogazione del DB locale
    const store = deps.duckDbStore || duckDbStore;
    if (!store || typeof store.query !== 'function') {
        trackUnresolvedType(item, 'duckDbStore non disponibile per lookup DB');
        return null;
    }

    const explicitId = deps.tmdbId || deps.identity?.tmdbId || item?.tmdbId;
    let cleanId = '';
    if (explicitId) {
        cleanId = String(explicitId).replace(/^tmdb:(tv:|movie:)?/i, '').split(':')[0].trim();
    } else {
        const rawId = String(item.itemId || item._id || item.id || '').trim();
        const tmdbMatch = rawId.match(/^tmdb:(?:tv:|movie:)?(\d+)/i) || rawId.match(/^(\d+)$/);
        if (tmdbMatch) cleanId = tmdbMatch[1];
    }

    if (!cleanId || !/^\d+$/.test(cleanId)) {
        trackUnresolvedType(item, `Nessun TMDB ID numerico per lookup DB (${item.itemId || item._id})`);
        return null;
    }

    try {
        const numId = Number(cleanId);
        const [movieRows, tvRows] = await Promise.all([
            store.query('SELECT CAST(id AS VARCHAR) AS id FROM movies WHERE id = ? LIMIT 1', [numId]).catch(() => []),
            store.query('SELECT CAST(id AS VARCHAR) AS id FROM tv WHERE id = ? LIMIT 1', [numId]).catch(() => [])
        ]);

        const inMovies = Array.isArray(movieRows) && movieRows.length > 0;
        const inTv = Array.isArray(tvRows) && tvRows.length > 0;

        if (inMovies && !inTv) return 'movie';
        if (inTv && !inMovies) return 'tv';
        if (inMovies && inTv) {
            // Collisione: presente in entrambe le tabelle del DB TMDB
            // NON SI INDOVINA MAI
            trackUnresolvedType(item, `Collisione DB: TMDB ID ${cleanId} presente sia in movies che in tv`);
            return null;
        }

        // Assente da entrambe le tabelle del DB
        trackUnresolvedType(item, `TMDB ID ${cleanId} assente sia da movies che da tv`);
        return null;
    } catch (err) {
        trackUnresolvedType(item, `Errore durante query DB: ${err.message}`);
        return null;
    }
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
    resolveMediaTypeFromDb,
    resolveTargetTableAndEndpoint,
    trackUnresolvedType,
    getUnresolvedTypeLog,
    clearUnresolvedTypeLog
};
