/**
 * Kids Mode Filters
 * These filters are explicitly enforced on TMDB API discover requests 
 * to ensure no adult, violent, or inappropriate content slips through.
 */

const ADULT_KEYWORD_IDS = [
    195669, // ecchi
    9194,   // harem
    198385, // hentai
    356759, // porn
    267122, // sex
    360629, // adult
    281741, // nudity
    256466, // erotic
    325693, // erotica
    155477, // softcore
    10292,  // gore
    284439, // blood
    312898, // violence
    361470, // scary
    14964,  // drugs
    9826,   // murder
    1849,   // homicide
    10714,  // serial killer
    161919, // adult animation
    11192,  // adult humor
    9964,   // crude humor
    204950, // innuendo
    220192  // dirty joke
].join(',');

const ADULT_GENRE_IDS = [
    27, // Horror
    53, // Thriller
    80  // Crime
].join(',');

const ADULT_GENRE_SET = new Set(ADULT_GENRE_IDS.split(',').map(Number));
const ADULT_KEYWORD_SET = new Set(ADULT_KEYWORD_IDS.split(',').map(Number));

function isRestrictedCertification(value) {
    if (value === undefined || value === null) return false;
    const normalized = String(value).trim().toUpperCase();
    if (!normalized) return false;
    if (['TV-MA', 'NC-17', 'R', 'X'].includes(normalized)) return true;
    return /(?:^|[^0-9])(1[4-9])(?:[^0-9]|$)/.test(normalized);
}

function hasRestrictedCertification(data) {
    if (isRestrictedCertification(data.content_rating) || isRestrictedCertification(data.certification)) {
        return true;
    }

    const releaseCountries = data.release_dates?.results;
    if (!Array.isArray(releaseCountries)) return false;
    return releaseCountries.some(country => {
        const releases = country?.release_dates;
        return Array.isArray(releases)
            && releases.some(release => isRestrictedCertification(release?.certification));
    });
}

/**
 * Checks if a given item (meta, TMDB object, DuckDB row) is inappropriate for kids.
 * @param {Object} item
 * @returns {boolean} true if inappropriate, false if family-safe
 */
function isItemInappropriateForKids(item) {
    // Unknown content is unsafe in kids mode. Returning true here is intentional:
    // a missing TMDB row or incomplete metadata must fail closed.
    if (!item) return true;
    const data = item.rawTMDB || item.data || item;

    // The dump may carry an Italian/US certification even when discovery could
    // not use certification_lte (which is too lossy across missing countries).
    if (hasRestrictedCertification(data)) return true;

    // 1. Check genres and remember whether this safety signal is actually present.
    const rawGenres = data.genre_ids || data.genres || [];
    const genreSource = Array.isArray(rawGenres)
        ? rawGenres
        : (typeof rawGenres === 'string' ? rawGenres.split(/[,|]/) : [rawGenres]);
    const genreIds = genreSource
        .map(g => (typeof g === 'object' && g !== null ? g.id : g))
        .map(Number)
        .filter(id => Number.isFinite(id) && id > 0);
    const hasGenreMetadata = genreIds.length > 0;

    for (const gid of genreIds) {
        if (ADULT_GENRE_SET.has(gid)) return true;
    }

    // 2. Check keywords and apply the same fail-closed rule to that signal.
    const kwSource = Array.isArray(data.keywords)
        ? data.keywords
        : (data.keywords && typeof data.keywords === 'object'
            ? (data.keywords.results ?? data.keywords.keywords ?? [])
            : data.keywords);
    const kwItems = Array.isArray(kwSource)
        ? kwSource
        : (typeof kwSource === 'string' ? kwSource.split(/[,|]/) : []);
    const keywordIds = kwItems
        .map(k => (typeof k === 'object' && k !== null ? k.id : k))
        .map(Number)
        .filter(id => Number.isFinite(id) && id > 0);
    const hasKeywordMetadata = keywordIds.length > 0;

    for (const kid of keywordIds) {
        if (ADULT_KEYWORD_SET.has(kid)) return true;
    }

    // At least one recognized safety signal is required. This prevents a bare
    // title/poster from bypassing the hard filter while keeping valid catalog
    // rows whose provider supplies genres but no keyword list.
    return !hasGenreMetadata && !hasKeywordMetadata;
}

/**
 * Applies kids mode either by enriching TMDB/DuckDB query parameters
 * or by hard-filtering an array of content items.
 * @param {Object|Array} paramsOrItems
 * @returns {Object|Array}
 */
function applyKidsMode(paramsOrItems) {
    if (!paramsOrItems) return paramsOrItems;

    // Hard-filtering if passed an array of items/candidates
    if (Array.isArray(paramsOrItems)) {
        return paramsOrItems.filter(item => !isItemInappropriateForKids(item));
    }

    const safeParams = { ...paramsOrItems };
    
    // 1. certification_lte/country is omitted because it aggressively filters out
    // non-US content (like Anime) that lacks a formal US rating. When a concrete
    // certification is already present, the post-fetch guard above still blocks it.

    // 2. Block sensitive genres
    if (safeParams.without_genres) {
        safeParams.without_genres = `${safeParams.without_genres},${ADULT_GENRE_IDS}`;
    } else {
        safeParams.without_genres = ADULT_GENRE_IDS;
    }

    // 3. Block sensitive keywords (using TMDB integer IDs)
    if (safeParams.without_keywords) {
        safeParams.without_keywords = `${safeParams.without_keywords},${ADULT_KEYWORD_IDS}`;
    } else {
        safeParams.without_keywords = ADULT_KEYWORD_IDS;
    }

    return safeParams;
}

module.exports = {
    applyKidsMode,
    isItemInappropriateForKids,
    ADULT_KEYWORD_IDS,
    ADULT_GENRE_IDS
};
