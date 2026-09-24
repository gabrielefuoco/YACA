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

/**
 * Checks if a given item (meta, TMDB object, DuckDB row) is inappropriate for kids.
 * @param {Object} item
 * @returns {boolean} true if inappropriate, false if family-safe
 */
function isItemInappropriateForKids(item) {
    if (!item) return false;
    const data = item.rawTMDB || item.data || item;

    // 1. Check genres
    const rawGenres = data.genre_ids || data.genres || [];
    const genreIds = Array.isArray(rawGenres)
        ? rawGenres.map(g => (typeof g === 'object' && g !== null ? g.id : g))
        : (typeof rawGenres === 'string' ? rawGenres.split(/[,|]/) : [rawGenres]);

    for (const gid of genreIds) {
        const num = Number(gid);
        if (!isNaN(num) && ADULT_GENRE_SET.has(num)) {
            return true;
        }
    }

    // 2. Check keywords
    const kwSource = Array.isArray(data.keywords)
        ? data.keywords
        : (Array.isArray(data.keywords?.results) && data.keywords.results.length > 0
            ? data.keywords.results
            : (data.keywords?.keywords || data.keywords || []));
    const kwItems = Array.isArray(kwSource)
        ? kwSource
        : (typeof kwSource === 'string' ? kwSource.split(/[,|]/) : []);

    for (const k of kwItems) {
        const kid = typeof k === 'object' && k !== null ? k.id : k;
        const num = Number(kid);
        if (!isNaN(num) && ADULT_KEYWORD_SET.has(num)) {
            return true;
        }
    }

    return false;
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
    
    // 1. Omitted certification_lte/country because it aggressively filters out 99% of non-US content (like Anime) that lacks a formal US rating, causing fallback triggering. We rely on strict keyword/genre blocking instead.

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
