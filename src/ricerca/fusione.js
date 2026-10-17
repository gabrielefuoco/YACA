/**
 * src/ricerca/fusione.js
 *
 * Il modulo ricerca possiede la FUSIONE e l'ORDINAMENTO dei candidati (Ticket 22).
 * Da candidati provenienti da più fonti (locale DuckDB, coda lunga Tier 2 FTS5,
 * nomi appresi, altri provider) produce un'unica lista ordinata e deduplicata.
 *
 * Regole di fusione (ereditate e formalizzate da searchTier2Merge):
 * 1. Prima i titoli locali (nell'ordine di pertinenza DuckDB/BM25: poster e titolo italiano pronti).
 * 2. Poi i titoli del Tier 2 nell'ordine dell'indice (marcati con _tier2: true).
 * 3. In coda i nomi appresi e altri risultati secondari.
 * 4. In caso di ID in comune vince il locale; il Tier 2 viene scartato (nessun doppione).
 * 5. I duplicati interni ai locali non vengono alterati.
 * 6. Nessuna chiamata di rete né eccezioni.
 */

const TIER2_FLAG = '_tier2';

/**
 * Estrae l'id TMDB numerico da un meta (`tmdb:123`), da una riga dell'indice o da un oggetto TMDB.
 *
 * @param {*} value
 * @returns {number|null} ID numerico TMDB valido (> 0) o null
 */
function toTmdbId(value) {
    if (!value) return null;
    const raw = typeof value === 'object'
        ? (value._tmdbId !== null && value._tmdbId !== undefined ? value._tmdbId : value.id)
        : value;
    const clean = String(raw === null || raw === undefined ? '' : raw).replace(/^tmdb:/i, '').trim();
    const id = Number(clean);
    return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Fusione canonica tra risultati locali (Tier 1) e risultati coda lunga (Tier 2).
 *
 * @param {Array<Object>} [localItems=[]] - Titoli locali DuckDB
 * @param {Array<Object>} [tier2Items=[]] - Titoli coda lunga FTS5
 * @returns {Array<Object>} Lista fusa ordinata e deduplicata
 */
function mergeLocalWithTier2(localItems = [], tier2Items = []) {
    const seen = new Set();
    const merged = [];

    const safeLocals = Array.isArray(localItems) ? localItems : [];
    const safeTier2 = Array.isArray(tier2Items) ? tier2Items : [];

    for (const item of safeLocals) {
        const key = toTmdbId(item);
        if (key) seen.add(key);
        merged.push(item);
    }

    for (const item of safeTier2) {
        const key = toTmdbId(item);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        merged.push(item);
    }

    return merged;
}

/**
 * Fusione generale a cascata su N fonti di candidati.
 *
 * @param {Object} tiers - Oggetto con insiemi di candidati: { locali, tier2, learned, altri }
 * @param {Object} [options] - Opzioni (limit/cap)
 * @returns {Array<Object>} Lista ordinata e deduplicata
 */
function fondiEOrdina({ locali = [], tier2 = [], learned = [], altri = [] } = {}, options = {}) {
    let result = mergeLocalWithTier2(locali, tier2);

    if (Array.isArray(learned) && learned.length > 0) {
        result = mergeLocalWithTier2(result, learned);
    }

    if (Array.isArray(altri) && altri.length > 0) {
        result = mergeLocalWithTier2(result, altri);
    }

    const limit = options.limit || options.cap;
    if (limit && Number.isFinite(limit) && limit > 0) {
        return result.slice(0, limit);
    }

    return result;
}

module.exports = {
    TIER2_FLAG,
    toTmdbId,
    mergeLocalWithTier2,
    fondiEOrdina
};
