const TasteProfile = require('../../models/TasteProfile');
const UserAccount = require('../../db/models/UserAccount');
const AddonConfig = require('../../db/models/AddonConfig');
const tmdb = require('../../clients/tmdb');
const { traktClient } = require('../../clients/trakt');
const { normalizeContentId } = require('../../utils/contentId');
const { rateLimitedMap } = require('../../utils/rateLimiter');

/**
 * Loads the profile context needed by hybrid catalogs in one place.
 * @param {string} userId Unique user ID
 * @param {string} context Active profile ID
 * @returns {Promise<{profile: Object|null, user: Object|null, globalProfile: Object|null}>}
 */
async function fetchProfileContext(userId, context) {
    const account = await UserAccount.findOne({ userId }).lean();
    const addonConfig = account?.addonUuid
        ? await AddonConfig.findOne({ uuid: account.addonUuid }).lean()
        : null;

    const [profile, globalProfile] = await Promise.all([
        TasteProfile.findOne({ owner: userId, context }),
        context === 'global' ? Promise.resolve(null) : TasteProfile.findOne({ owner: userId, context: 'global' })
    ]);

    let user = null;
    if (addonConfig) {
        user = { ...addonConfig, apiKeys: account?.apiKeys || {} };
    } else if (account?.apiKeys) {
        user = { profiles: [], apiKeys: account.apiKeys };
    }

    return { profile, user, globalProfile };
}

/**
 * Executes a TMDB query through the standardized client and always returns an array.
 * On failure it logs the issue and returns [] to keep the flow best-effort.
 */
async function fetchTmdbResults(tmdbClient, endpoint, params = {}, errorLabel = endpoint) {
    try {
        const res = await tmdbClient.get(endpoint, { params, timeout: 5000 });
        return res.data?.results || [];
    } catch (err) {
        console.warn(`[Hybrid] ${errorLabel} failed:`, err.message);
        return [];
    }
}

/**
 * Generic fetcher for Trakt to DRY up redundant calls.
 */
async function safeTraktFetch(endpoint, traktToken, limit = 40) {
    if (!traktToken || !process.env.TRAKT_CLIENT_ID) return [];
    try {
        const res = await traktClient.get(endpoint, {
            headers: {
                'trakt-api-version': '2',
                'trakt-api-key': process.env.TRAKT_CLIENT_ID,
                'Authorization': `Bearer ${traktToken}`
            },
            params: { limit, page: 1 },
            timeout: 10000
        });
        return res.data || [];
    } catch (_e) {
        return [];
    }
}

async function fetchRecentHistory(traktToken, mediaType, limit = 10) {
    return safeTraktFetch(`/users/me/history/${mediaType}`, traktToken, limit);
}

async function fetchRecentRatings(traktToken, mediaType, limit = 40) {
    return safeTraktFetch(`/users/me/ratings/${mediaType}`, traktToken, limit);
}

async function fetchTraktRecommendationsRaw(traktToken, mediaType, limit = 40) {
    return safeTraktFetch(`/recommendations/${mediaType}`, traktToken, limit);
}

async function fetchPopularFallbackIds(tmdbApiKey, mediaType, limit = 60) {
    const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const results = await fetchTmdbResults(
        tmdbClient,
        `/discover/${tmdbType}`,
        { sort_by: 'popularity.desc', 'vote_count.gte': 50 },
        `Popular fallback (${mediaType})`
    );
    return results
        .map(item => normalizeContentId(item.id))
        .filter(Boolean)
        .slice(0, limit);
}

async function fetchHiddenGemsFallbackIds(tmdbApiKey, mediaType, limit = 60) {
    const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    const results = await fetchTmdbResults(
        tmdbClient,
        `/discover/${tmdbType}`,
        {
            sort_by: 'vote_average.desc',
            'vote_count.gte': 50,
            'vote_count.lte': 2000,
            'vote_average.gte': 7.0
        },
        `Hidden Gems fallback (${mediaType})`
    );
    return results
        .filter(item => (item.popularity ?? Infinity) <= 80)
        .map(item => normalizeContentId(item.id))
        .filter(Boolean)
        .slice(0, limit);
}

async function fetchTmdbSimilarCounts(seedTmdbIds, tmdbApiKey, mediaType = 'movie') {
    const types = mediaType === 'movie' ? 'movie' : 'tv';
    const counts = new Map();
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);

    if (!seedTmdbIds || seedTmdbIds.length === 0) return counts;

    const results = await rateLimitedMap(
        seedTmdbIds,
        (id) => fetchTmdbResults(tmdbClient, `/${types}/${id}/recommendations`, {}, `Similar fetch (${types}/${id})`),
        { batchSize: 5, delayMs: 50 }
    );

    results.forEach(items => {
        if (Array.isArray(items)) {
            for (const item of items) {
                counts.set(item.id, (counts.get(item.id) || 0) + 1);
            }
        }
    });

    return counts;
}

module.exports = {
    fetchProfileContext,
    fetchTmdbResults,
    safeTraktFetch,
    fetchRecentHistory,
    fetchRecentRatings,
    fetchTraktRecommendationsRaw,
    fetchPopularFallbackIds,
    fetchHiddenGemsFallbackIds,
    fetchTmdbSimilarCounts
};
