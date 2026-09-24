const TasteProfile = require('../../models/TasteProfile');
const UserAccount = require('../../db/models/UserAccount');
const AddonConfig = require('../../db/models/AddonConfig');
const { traktClient } = require('../../clients/trakt');
const { normalizeContentId } = require('../../utils/contentId');
const { rateLimitedMap } = require('../../utils/rateLimiter');
const { getDuckDbCatalogFromFilters } = require('../../catalog/providers/DuckDbProvider');
const { applyKidsMode } = require('../../utils/kidsModeFilters');

const MAX_HERO_FALLBACK_FETCH = 200;
const HERO_FALLBACK_LIMIT = 160;
// 20 separa le code lunghe dai titoli già mainstream (i falsi positivi osservati
// nel ticket 23 partivano da 41.4), mantenendo comunque ampia la finestra.
const HIDDEN_GEMS_MAX_POPULARITY = 20;
// 1.000 è la soglia già usata dal builder hidden_gems normale (50–1.000 voti).
// Il fallback deve applicare lo stesso contratto, altrimenti il ramo freddo
// amplia il range e invalida la deduplicazione/qualità verificata sul builder.
const HIDDEN_GEMS_MAX_VOTES = 1000;
const TOP_RATED_FALLBACK_MONTHS = 60;
const DISCOVERY_FALLBACK_MONTHS = Object.freeze({ movie: 12, series: 24 });

function compareContentIds(a, b) {
    const idA = String(a ?? '');
    const idB = String(b ?? '');
    const numA = Number(idA);
    const numB = Number(idB);
    if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB;
    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
}

function getNumericSortValue(item, field) {
    const value = Number(item?.[field]);
    return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function isHiddenGemPopularity(value) {
    const popularity = Number(value);
    return Number.isFinite(popularity) && popularity <= HIDDEN_GEMS_MAX_POPULARITY;
}

function getDateSortValue(item) {
    const raw = item?.release_date || item?.first_air_date || item?.last_air_date;
    if (!raw) return Number.NEGATIVE_INFINITY;
    const timestamp = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function rollingDateStart(months) {
    const date = new Date();
    date.setUTCMonth(date.getUTCMonth() - months);
    return date.toISOString().slice(0, 10);
}

async function fetchFallbackRows(filters, type, limit, isKidsMode) {
    const fetchLimit = Math.min(MAX_HERO_FALLBACK_FETCH, Math.max(40, Number(limit) || 0));
    let pending;
    try {
        pending = getDuckDbCatalogFromFilters(filters, type, 0, fetchLimit, {});
    } catch (_error) {
        return [];
    }
    const results = await Promise.resolve(pending).catch(() => []);
    if (!Array.isArray(results)) return [];
    return isKidsMode ? applyKidsMode(results) : results;
}

function getFallbackCollectionId(item) {
    const rawId = item?.collection_id
        ?? item?.belongs_to_collection?.id
        ?? item?.rawTMDB?.collection_id
        ?? item?.rawTMDB?.belongs_to_collection?.id;
    return rawId === null || rawId === undefined || String(rawId).trim() === '' ? null : String(rawId).trim();
}

function getFallbackDirectorIds(item) {
    const rawDirectors = item?.directors || item?.rawTMDB?.directors || item?.rawTMDB?.credits?.crew || [];
    const directors = Array.isArray(rawDirectors) ? rawDirectors : [];
    return [...new Set(directors
        .filter(person => person?.job === 'Director' && person?.id !== undefined)
        .map(person => String(person.id)))];
}

function mapStableFallbackIds(rows, limit, compareRows) {
    const seen = new Set();
    const candidates = [];
    for (const item of rows) {
        const rawId = item?._tmdbId ?? item?.id;
        const id = normalizeContentId(rawId);
        if (!id || ['undefined', 'null', 'nan'].includes(id.toLowerCase()) || seen.has(id)) continue;
        seen.add(id);
        candidates.push({ id, item });
    }
    candidates.sort((a, b) => compareRows(a.item, b.item) || compareContentIds(a.id, b.id));

    const maxItems = Math.max(0, Number(limit) || 0);
    if (maxItems === 0) return [];
    const seenCollections = new Set();
    const seenDirectors = new Set();
    const selected = [];
    for (const candidate of candidates) {
        const collectionId = getFallbackCollectionId(candidate.item);
        if (collectionId && seenCollections.has(collectionId)) continue;
        const directorIds = getFallbackDirectorIds(candidate.item);
        if (directorIds.some(directorId => seenDirectors.has(directorId))) continue;

        if (collectionId) seenCollections.add(collectionId);
        directorIds.forEach(directorId => seenDirectors.add(directorId));
        selected.push(candidate.id);
        if (selected.length >= maxItems) break;
    }
    return selected;
}

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
async function safeTraktFetchDetailed(endpoint, traktToken, limit = 40, userObj = null) {
    if (!traktToken || !process.env.TRAKT_CLIENT_ID) {
        return { items: [], available: false, reason: 'credentials' };
    }

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

    const toResult = data => {
        const items = Array.isArray(data) ? data : [];
        return {
            items,
            available: items.length > 0,
            reason: items.length > 0 ? 'ok' : 'empty'
        };
    };

    try {
        return toResult(await execute(traktToken));
    } catch (err) {
        console.error(`[safeTraktFetch] Error for ${endpoint}: status=${err.response?.status}, msg=${err.message}, hasUserObj=${!!userObj}, hasRefreshToken=${!!userObj?.apiKeys?.traktRefreshToken}`);
        const status = err.response?.status;
        if ((status === 401 || status === 403) && userObj?.apiKeys?.traktRefreshToken) {
            console.log(`[safeTraktFetch] Token expired or forbidden (${status}) for ${endpoint}. Attempting refresh...`);
            const { smartTraktRefresh } = require('../../clients/trakt');

            try {
                const newTokens = await smartTraktRefresh(userObj.userId, userObj.apiKeys.traktRefreshToken);
                if (newTokens && newTokens.access_token) {
                    // Update userObj in memory so subsequent calls in the same request use the new token
                    userObj.apiKeys.trakt = newTokens.access_token;
                    userObj.apiKeys.traktRefreshToken = newTokens.refresh_token;

                    console.log(`[safeTraktFetch] Token refreshed successfully. Retrying ${endpoint}...`);
                    return toResult(await execute(newTokens.access_token));
                }
            } catch (refreshErr) {
                console.error(`[safeTraktFetch] Refresh failed:`, refreshErr.message);
            }
            return { items: [], available: false, reason: status === 403 ? 'forbidden' : 'unauthorized' };
        }
        return { items: [], available: false, reason: status === 403 ? 'forbidden' : 'error' };
    }
}

async function safeTraktFetch(endpoint, traktToken, limit = 40, userObj = null) {
    const result = await safeTraktFetchDetailed(endpoint, traktToken, limit, userObj);
    return result.items;
}

async function fetchRecentHistory(traktToken, mediaType, limit = 10, userObj = null) {
    return safeTraktFetch(`/users/me/history/${mediaType}`, traktToken, limit, userObj);
}

async function fetchRecentRatings(traktToken, mediaType, limit = 40, userObj = null) {
    return safeTraktFetch(`/users/me/ratings/${mediaType}`, traktToken, limit, userObj);
}

async function fetchTraktRecommendationsRawDetailed(traktToken, mediaType, limit = 40, userObj = null) {
    return safeTraktFetchDetailed(`/recommendations/${mediaType}`, traktToken, limit, userObj);
}

async function fetchTraktRecommendationsRaw(traktToken, mediaType, limit = 40, userObj = null) {
    return safeTraktFetch(`/recommendations/${mediaType}`, traktToken, limit, userObj);
}

async function fetchPopularFallbackIds(tmdbApiKey, mediaType, limit = HERO_FALLBACK_LIMIT, isKidsMode = false) {
    const type = mediaType === 'movie' ? 'movie' : 'series';
    const baseFilters = { sort_by: 'popularity.desc', 'vote_count.gte': 50 };
    const filters = isKidsMode ? applyKidsMode(baseFilters) : baseFilters;
    const results = await fetchFallbackRows(filters, type, limit, isKidsMode);
    return mapStableFallbackIds(
        results,
        limit,
        (a, b) => getNumericSortValue(b, 'popularity') - getNumericSortValue(a, 'popularity')
    );
}

async function fetchTopRatedPeriodFallbackIds(tmdbApiKey, mediaType, limit = HERO_FALLBACK_LIMIT, isKidsMode = false) {
    const type = mediaType === 'movie' ? 'movie' : 'series';
    const baseFilters = {
        sort_by: 'vote_average.desc',
        'primary_release_date.gte': rollingDateStart(TOP_RATED_FALLBACK_MONTHS),
        'vote_count.gte': 100,
        'vote_average.gte': 6.5
    };
    const filters = isKidsMode ? applyKidsMode(baseFilters) : baseFilters;
    const results = await fetchFallbackRows(filters, type, limit, isKidsMode);
    return mapStableFallbackIds(results, limit, (a, b) => {
        const scoreDelta = getNumericSortValue(b, 'vote_average') - getNumericSortValue(a, 'vote_average');
        return scoreDelta || getNumericSortValue(b, 'vote_count') - getNumericSortValue(a, 'vote_count');
    });
}

async function fetchUndiscoveredFallbackIds(tmdbApiKey, mediaType, limit = HERO_FALLBACK_LIMIT, isKidsMode = false) {
    const type = mediaType === 'movie' ? 'movie' : 'series';
    const baseFilters = {
        sort_by: type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc',
        'primary_release_date.gte': rollingDateStart(DISCOVERY_FALLBACK_MONTHS[type]),
        'vote_count.gte': type === 'movie' ? 10 : 20,
        'vote_average.gte': 5.5
    };
    const filters = isKidsMode ? applyKidsMode(baseFilters) : baseFilters;
    const results = await fetchFallbackRows(filters, type, limit, isKidsMode);
    return mapStableFallbackIds(results, limit, (a, b) => {
        const dateDelta = getDateSortValue(b) - getDateSortValue(a);
        return dateDelta || getNumericSortValue(b, 'vote_average') - getNumericSortValue(a, 'vote_average');
    });
}

async function fetchHiddenGemsFallbackIds(tmdbApiKey, mediaType, limit = HERO_FALLBACK_LIMIT, isKidsMode = false) {
    const type = mediaType === 'movie' ? 'movie' : 'series';
    const baseFilters = {
        sort_by: 'vote_average.desc',
        'vote_count.gte': 50,
        'vote_count.lte': HIDDEN_GEMS_MAX_VOTES,
        'vote_average.gte': 7.0,
        'popularity.lte': HIDDEN_GEMS_MAX_POPULARITY
    };
    const filters = isKidsMode ? applyKidsMode(baseFilters) : baseFilters;
    const results = (await fetchFallbackRows(filters, type, limit, isKidsMode))
        .filter(item => isHiddenGemPopularity(item.popularity));
    return mapStableFallbackIds(results, limit, (a, b) => {
        const scoreDelta = getNumericSortValue(b, 'vote_average') - getNumericSortValue(a, 'vote_average');
        return scoreDelta || getNumericSortValue(b, 'vote_count') - getNumericSortValue(a, 'vote_count');
    });
}

async function fetchTmdbSimilarCounts(seedTmdbIds, tmdbApiKey, mediaType = 'movie') {
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
    safeTraktFetchDetailed,
    fetchRecentHistory,
    fetchRecentRatings,
    fetchTraktRecommendationsRaw,
    fetchTraktRecommendationsRawDetailed,
    fetchPopularFallbackIds,
    fetchTopRatedPeriodFallbackIds,
    fetchUndiscoveredFallbackIds,
    fetchHiddenGemsFallbackIds,
    HIDDEN_GEMS_MAX_POPULARITY,
    HIDDEN_GEMS_MAX_VOTES,
    fetchTmdbSimilarCounts,
    getImpressionMap,
    calculateImpressionPenalty
};
