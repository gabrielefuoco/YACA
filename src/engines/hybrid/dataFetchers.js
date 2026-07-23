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
        user = { ...addonConfig, userId, apiKeys: account?.apiKeys || {} };
    } else if (account?.apiKeys) {
        user = { profiles: [], userId, apiKeys: account.apiKeys };
    }

    return { profile, user, globalProfile };
}


/**
 * Generic fetcher for Trakt to DRY up redundant calls.
 * Includes auto-refresh logic for expired Trakt tokens.
 */
async function safeTraktFetch(endpoint, traktToken, limit = 40, userObj = null) {
    if (!traktToken || !process.env.TRAKT_CLIENT_ID) return [];
    
    const execute = async (token) => {
        const res = await traktClient.get(endpoint, {
            headers: {
                'trakt-api-version': '2',
                'trakt-api-key': process.env.TRAKT_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            },
            params: { limit, page: 1 },
            timeout: 10000
        });
        return res.data || [];
    };

    try {
        return await execute(traktToken);
    } catch (err) {
        console.error(`[safeTraktFetch] Error for ${endpoint}: status=${err.response?.status}, msg=${err.message}, hasUserObj=${!!userObj}, hasRefreshToken=${!!userObj?.apiKeys?.traktRefreshToken}`);
        if (err.response?.status === 401 && userObj?.apiKeys?.traktRefreshToken) {
            console.log(`[safeTraktFetch] Token expired for ${endpoint}. Attempting refresh...`);
            const { smartTraktRefresh } = require('../../clients/trakt');
            
            try {
                const newTokens = await smartTraktRefresh(userObj.userId, userObj.apiKeys.traktRefreshToken);
                if (newTokens && newTokens.access_token) {
                    // Update userObj in memory so subsequent calls in the same request use the new token
                    userObj.apiKeys.trakt = newTokens.access_token;
                    userObj.apiKeys.traktRefreshToken = newTokens.refresh_token;

                    console.log(`[safeTraktFetch] Token refreshed successfully. Retrying ${endpoint}...`);
                    return await execute(newTokens.access_token);
                }
            } catch (refreshErr) {
                console.error(`[safeTraktFetch] Refresh failed:`, refreshErr.message);
            }
        }
        return [];
    }
}

async function fetchRecentHistory(traktToken, mediaType, limit = 10, userObj = null) {
    return safeTraktFetch(`/users/me/history/${mediaType}`, traktToken, limit, userObj);
}

async function fetchRecentRatings(traktToken, mediaType, limit = 40, userObj = null) {
    return safeTraktFetch(`/users/me/ratings/${mediaType}`, traktToken, limit, userObj);
}

async function fetchTraktRecommendationsRaw(traktToken, mediaType, limit = 40, userObj = null) {
    return safeTraktFetch(`/recommendations/${mediaType}`, traktToken, limit, userObj);
}

async function fetchPopularFallbackIds(tmdbApiKey, mediaType, limit = 60) {
    const { getDuckDbCatalogFromFilters } = require('../../catalog/providers/DuckDbProvider');
    const type = mediaType === 'movie' ? 'movie' : 'series';
    const results = await getDuckDbCatalogFromFilters({ sort_by: 'popularity.desc', 'vote_count.gte': 50 }, type, 0, 40, {}).catch(() => []);
    return results
        .map(item => normalizeContentId(item.id))
        .filter(Boolean)
        .slice(0, limit);
}

async function fetchHiddenGemsFallbackIds(tmdbApiKey, mediaType, limit = 60) {
    const { getDuckDbCatalogFromFilters } = require('../../catalog/providers/DuckDbProvider');
    const type = mediaType === 'movie' ? 'movie' : 'series';
    const results = await getDuckDbCatalogFromFilters({
        sort_by: 'vote_average.desc',
        'vote_count.gte': 50,
        'vote_count.lte': 2000,
        'vote_average.gte': 7.0
    }, type, 0, 40, {}).catch(() => []);
    return results
        .filter(item => (item.popularity ?? Infinity) <= 80)
        .map(item => normalizeContentId(item.id))
        .filter(Boolean)
        .slice(0, limit);
}

async function fetchTmdbSimilarCounts(seedTmdbIds, tmdbApiKey, mediaType = 'movie') {
    const { getDuckDbCatalogFromFilters } = require('../../catalog/providers/DuckDbProvider');
    const type = mediaType === 'movie' ? 'movie' : 'series';
    const counts = new Map();

    if (!seedTmdbIds || seedTmdbIds.length === 0) return counts;

    const results = await rateLimitedMap(
        seedTmdbIds,
        (id) => getDuckDbCatalogFromFilters({ similar_to: id }, type, 0, 40, {}).catch(() => []),
        { batchSize: 3, delayMs: 150 }
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

async function getImpressionMap(userId, context, catalogId, candidateIds) {
    const impressionMap = new Map();
    try {
        const RecommendationImpression = require('../../models/RecommendationImpression');
        const impressions = await RecommendationImpression.find({
            owner: userId,
            profileId: context,
            catalogId: catalogId,
            tmdbId: { $in: candidateIds }
        }).lean();
        for (const imp of impressions) {
            impressionMap.set(String(imp.tmdbId), imp.seenDates.length);
        }
    } catch (_e) { }
    return impressionMap;
}

function calculateImpressionPenalty(seenDays) {
    if (seenDays >= 3) {
        return Math.max(0.2, 1.0 - (seenDays - 2) * 0.2);
    }
    return 1.0;
}

module.exports = {
    fetchProfileContext,
    safeTraktFetch,
    fetchRecentHistory,
    fetchRecentRatings,
    fetchTraktRecommendationsRaw,
    fetchPopularFallbackIds,
    fetchHiddenGemsFallbackIds,
    fetchTmdbSimilarCounts,
    getImpressionMap,
    calculateImpressionPenalty
};
