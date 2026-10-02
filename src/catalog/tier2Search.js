/**
 * tier2Search.js
 *
 * La ricerca testuale interroga **due** insiemi:
 *   - il **Tier 1** (catalogo locale su DuckDB): 117k titoli con titolo italiano, poster e voti;
 *   - il **Tier 2** (export TMDB indicizzato in SQLite FTS5): 1.485.129 titoli, la coda lunga.
 *
 * Questo modulo fa **solo** il consumo dell'indice e la fusione dei due insiemi: nessuna
 * chiamata di rete, nessun arricchimento. I titoli del Tier 2 arrivano grezzi (solo titolo
 * originale e popolarità) e vengono marcati con `_tier2: true`, così lo strato successivo li
 * riconosce e li arricchisce (poster, titolo localizzato) senza doverlo dedurre.
 *
 * Degrado morbido: se l'indice non c'è, è illeggibile o la query fallisce, `searchTier2`
 * restituisce `[]` e la ricerca prosegue esattamente come prima (soli titoli locali).
 * L'indisponibilità viene segnalata **una volta sola**, per non sporcare il log a ogni ricerca.
 */

const { Tier2SearchClient } = require('../db/tier2Index');

/** Marcatore interno: questo meta viene dall'indice Tier 2 e non è ancora stato arricchito. */
const TIER2_FLAG = '_tier2';

// Quanti titoli del Tier 2 aggiungere a una pagina di ricerca (20 = PRESET_PAGE_SIZE).
const TIER2_PAGE_SIZE = 20;

let _client = null;
let _clientBroken = false;
let _unavailableLogged = false;

/** Il client tiene aperto l'handle SQLite: si riusa, non si riapre a ogni ricerca. */
function getTier2Client() {
    if (!_client) _client = new Tier2SearchClient();
    return _client;
}

function noteTier2Unavailable(reason, err) {
    if (_unavailableLogged) return;
    _unavailableLogged = true;
    console.warn(
        `[Tier2Search] Indice FTS5 del Tier 2 non disponibile (${reason}): la ricerca continua sui soli titoli locali.`,
        err ? err.message : ''
    );
}

/** Chiude l'handle e azzera il client (usato dai test e da un eventuale reload dell'indice). */
function closeTier2Search() {
    if (_client) {
        try { _client.close(); } catch (_) {}
    }
    _client = null;
    _clientBroken = false;
}

/** `series` (come arriva dal catalogo Stremio) è `tv` nell'indice. */
function toTier2Type(type) {
    return type === 'series' || type === 'tv' ? 'tv' : 'movie';
}

/** Estrae l'id TMDB numerico da un meta (`tmdb:123`) o da una riga cruda dell'indice (`'123'`). */
function toTmdbId(value) {
    const raw = value && typeof value === 'object'
        ? (value._tmdbId !== null && value._tmdbId !== undefined ? value._tmdbId : value.id)
        : value;
    const id = Number(String(raw === null || raw === undefined ? '' : raw).replace(/^tmdb:/i, ''));
    return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Rende una riga dell'indice un meta Stremio **grezzo**: il daily export porta solo il titolo
 * originale, quindi qui non ci sono poster, descrizione né titolo localizzato.
 */
function mapTier2RowToMeta(row) {
    const id = toTmdbId(row);
    if (!id) return null;

    const isMovie = row.type !== 'tv';
    const name = row.title || row.original_title || 'Unknown';

    return {
        id: `tmdb:${id}`,
        _tmdbId: id,
        type: isMovie ? 'movie' : 'series',
        name,
        poster: null,
        posterShape: 'poster',
        background: null,
        description: '',
        releaseInfo: null,
        popularity: Number(row.popularity) || 0,
        genres: [],
        genre_ids: [],
        rawTMDB: {
            id,
            title: row.title || null,
            original_title: row.original_title || null,
            popularity: Number(row.popularity) || 0,
            release_date: row.release_date || null
        },
        [TIER2_FLAG]: true
    };
}

/**
 * Interroga l'indice FTS5 del Tier 2 con lo **stesso testo** cercato sui titoli locali.
 * Non solleva mai: in assenza dell'indice (o su errore) restituisce `[]`.
 */
function searchTier2(search, { type = 'movie', limit = TIER2_PAGE_SIZE } = {}) {
    if (_clientBroken) return [];
    if (!search || typeof search !== 'string' || !search.trim()) return [];

    let client;
    try {
        client = getTier2Client();
        if (!client.init()) {
            noteTier2Unavailable('indice non trovato');
            return [];
        }
    } catch (err) {
        _clientBroken = true;
        noteTier2Unavailable('apertura fallita', err);
        return [];
    }

    try {
        const rows = client.search(search, { limit, type: toTier2Type(type) }) || [];
        return rows.map(mapTier2RowToMeta).filter(Boolean);
    } catch (err) {
        _clientBroken = true;
        noteTier2Unavailable('query fallita', err);
        return [];
    }
}

/**
 * Fusione: **prima** i titoli locali (nell'ordine e con i filtri di oggi: hanno titolo italiano
 * e poster pronti), **poi** i risultati del Tier 2 nell'ordine di rilevanza dell'indice.
 * In caso di id in comune vince il locale e il Tier 2 viene scartato; i duplicati interni ai
 * locali non vengono toccati, così la risposta resta identica a quella di prima.
 */
function mergeLocalWithTier2(localItems = [], tier2Items = []) {
    const seen = new Set();
    const merged = [];

    for (const item of localItems) {
        const key = toTmdbId(item);
        if (key) seen.add(key);
        merged.push(item);
    }

    for (const item of tier2Items) {
        const key = toTmdbId(item);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        merged.push(item);
    }

    return merged;
}

module.exports = {
    TIER2_FLAG,
    TIER2_PAGE_SIZE,
    searchTier2,
    mergeLocalWithTier2,
    mapTier2RowToMeta,
    toTier2Type,
    closeTier2Search
};