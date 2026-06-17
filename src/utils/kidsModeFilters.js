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
    9826    // murder
].join(',');

const ADULT_GENRE_IDS = [
    27, // Horror
    53, // Thriller
    80  // Crime
].join(',');

function applyKidsMode(params) {
    if (!params) return params;

    const safeParams = { ...params };
    
    // 1. Force general audiences certification
    safeParams.certification_lte = 'G';
    safeParams.certification_country = 'US';

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
    ADULT_KEYWORD_IDS,
    ADULT_GENRE_IDS
};
