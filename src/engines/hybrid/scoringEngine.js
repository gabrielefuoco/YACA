const TmdbScoringData = require('../../models/TmdbScoringData');
const ProfileScorer = require('../../profile/ProfileScorer');
const tmdb = require('../../clients/tmdb');
const { getProfileDnaFilters } = require('../../utils/helpers');
const { rateLimitedMap } = require('../../utils/rateLimiter');

function extractVectorByPrefix(vFinal, prefix) {
    if (!vFinal || typeof vFinal !== 'object') return {};
    const scores = {};
    const target = `${prefix}:`;
    for (const [key, value] of Object.entries(vFinal)) {
        if (key.startsWith(target)) {
            scores[key.slice(target.length)] = value;
        }
    }
    return scores;
}

function computeTopGenres(profile, n = 5, user = null, context = 'global') {
    let scores = {};
    const vFinal = profile?.compiledVectors?.V_final;
    if (vFinal && Object.keys(vFinal).length > 0) {
        scores = extractVectorByPrefix(vFinal, 'g');
    }
    
    const dnaFilters = getProfileDnaFilters(user, context);
    dnaFilters.filter(f => f.type === 'genre').forEach(f => {
        const gid = String(f.id);
        if (!scores[gid]) scores[gid] = 100;
        else scores[gid] += 50;
    });

    return Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(e => String(e[0]));
}

function computeTopKeywords(profile, n = 3, user = null, context = 'global') {
    let scores = {};
    const vFinal = profile?.compiledVectors?.V_final;
    if (vFinal && Object.keys(vFinal).length > 0) {
        scores = extractVectorByPrefix(vFinal, 'k');
    }
    
    const dnaFilters = getProfileDnaFilters(user, context);
    dnaFilters.filter(f => f.type === 'keyword').forEach(f => {
        const kid = String(f.id);
        if (!scores[kid]) scores[kid] = 100;
        else scores[kid] += 50;
    });

    return Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(e => String(e[0]));
}

function calculateHybridScore(item, tmdbCounts, topGenres, itemGenres) {
    let score = 0;

    if (item.position !== null && item.position !== undefined) {
        score += Math.max(0, 50 - item.position);
    }

    const count = tmdbCounts.get(item.tmdbId) || 0;
    if (count > 0) {
        score += Math.floor(100 / Math.pow(2, count - 1));
    }

    const topGenresNorm = topGenres.map(String);
    const itemGenresNorm = itemGenres.map(String);
    const genreBoosts = [30, 15, 5];
    const limit = Math.min(topGenresNorm.length, genreBoosts.length);
    for (let i = 0; i < limit; i++) {
        if (itemGenresNorm.includes(topGenresNorm[i])) {
            score += genreBoosts[i];
        }
    }

    return score;
}

function extractDNAParams(manualDNA = []) {
    const params = {};
    if (!manualDNA.length) return params;

    const genres = manualDNA.filter(p => p.type === 'genre').map(p => p.id);
    const keywords = manualDNA.filter(p => p.type === 'keyword').map(p => p.id);
    const countries = manualDNA.filter(p => p.type === 'country').map(p => p.id);

    if (genres.length) params.with_genres = genres.join('|');
    if (keywords.length) params.with_keywords = keywords.join('|');
    if (countries.length) params.with_origin_country = countries.join('|');

    return params;
}

async function resolveAiQueryToTmdbParams(aiQuery, tmdbApiKey, types) {
    const params = { api_key: tmdbApiKey };

    if (aiQuery.genre_ids && aiQuery.genre_ids.length > 0) {
        params.with_genres = aiQuery.genre_ids.join('|');
    }

    if (aiQuery.keyword) {
        const isOr = aiQuery.keyword.includes('|');
        const separator = isOr ? '|' : ',';
        const keywordNames = aiQuery.keyword.split(separator).map(k => k.trim()).filter(Boolean);

        const results = await Promise.allSettled(
            keywordNames.map(k => tmdb.getTmdbIdByName(tmdbApiKey, 'keyword', k))
        );
        const validIds = results
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => r.value);

        if (validIds.length > 0) {
            params.with_keywords = validIds.join(separator);
        }
    }

    return params;
}

async function saveScoringData(tmdbDetails, type) {
    if (!tmdbDetails || !tmdbDetails.id) return;

    const keywordItems = tmdbDetails.keywords?.keywords || tmdbDetails.keywords?.results || [];
    const directors = (tmdbDetails.credits?.crew || [])
        .filter(c => c.job === 'Director')
        .map(c => c.id)
        .filter(Boolean);
    const cast = (tmdbDetails.credits?.cast || [])
        .slice(0, 5)
        .map(c => c.id)
        .filter(Boolean);
    const genreIds = tmdbDetails.genre_ids || (tmdbDetails.genres ? tmdbDetails.genres.map(g => g.id) : []);

    try {
        await TmdbScoringData.updateOne(
            { tmdbId: tmdbDetails.id, type },
            {
                $set: {
                    vote_average: tmdbDetails.vote_average || 0,
                    vote_count: tmdbDetails.vote_count || 0,
                    genre_ids: genreIds,
                    keyword_ids: keywordItems.map(k => k.id).filter(Boolean),
                    director_ids: directors,
                    cast_ids: cast
                }
            },
            { upsert: true }
        );
    } catch (_e) { }
}

async function twoTierScore(pool, profile, options) {
    const { tmdbApiKey, types, dnaFilters, globalProfile } = options;

    const lightScored = pool.map(item => {
        const lightData = {
            id: item.id,
            genre_ids: item.genre_ids || [],
            vote_average: item.vote_average || 0,
            vote_count: item.vote_count || 0,
            keywords: item.keywords || []
        };
        const lightScore = ProfileScorer.calculateLightScore(lightData, profile, options);
        return { data: item, lightScore };
    });

    lightScored.sort((a, b) => b.lightScore - a.lightScore);
    const limit = (options && options.noLimit) ? lightScored.length : Math.min(80, Math.ceil(lightScored.length / 2));
    const survivors = lightScored.slice(0, limit);

    const survivorIds = survivors.map(s => s.data.id);
    let scoringCache = new Map();
    let impressionMap = new Map();
    try {
        const cached = await TmdbScoringData.find({ tmdbId: { $in: survivorIds }, type: types }).lean();
        for (const doc of cached) {
            scoringCache.set(doc.tmdbId, doc);
        }

        // Fetch seen days to apply aging penalty
        if (options && options.userId && options.context && options.catalogId) {
            const RecommendationImpression = require('../../models/RecommendationImpression');
            const impressions = await RecommendationImpression.find({
                owner: options.userId,
                profileId: options.context,
                catalogId: options.catalogId,
                tmdbId: { $in: survivorIds.map(String) }
            }).lean();
            for (const imp of impressions) {
                impressionMap.set(String(imp.tmdbId), imp.seenDates.length);
            }
        }
    } catch (_e) { }

    const scored = await rateLimitedMap(
        survivors,
        async ({ data }) => {
            const seenDays = impressionMap.get(String(data.id)) || 0;
            let penaltyMultiplier = 1.0;
            if (seenDays >= 3) {
                penaltyMultiplier = Math.max(0.2, 1.0 - (seenDays - 2) * 0.2);
            }

            const cachedScoring = scoringCache.get(data.id);
            if (cachedScoring) {
                const syntheticData = {
                    id: cachedScoring.tmdbId,
                    genre_ids: cachedScoring.genre_ids,
                    vote_average: cachedScoring.vote_average,
                    vote_count: cachedScoring.vote_count,
                    keywords: { keywords: cachedScoring.keyword_ids.map(id => ({ id })) },
                    credits: {
                        crew: cachedScoring.director_ids.map(id => ({ id, job: 'Director' })),
                        cast: cachedScoring.cast_ids.map(id => ({ id }))
                    }
                };
                const score = ProfileScorer.calculateItemMatch(syntheticData, profile, { dnaFilters, globalProfile });
                return { data, score: score * penaltyMultiplier };
            }

            const details = await tmdb.getTmdbMovieDetails(tmdbApiKey, data.id, types);
            if (!details) return { data, score: 0 };

            saveScoringData(details, types).catch(() => { });

            const score = ProfileScorer.calculateItemMatch(details, profile, { dnaFilters, globalProfile });
            return { data, score: score * penaltyMultiplier };
        },
        { batchSize: 5, delayMs: 50 }
    );

    return scored.sort((a, b) => b.score - a.score);
}

module.exports = {
    extractVectorByPrefix,
    computeTopGenres,
    computeTopKeywords,
    calculateHybridScore,
    extractDNAParams,
    resolveAiQueryToTmdbParams,
    saveScoringData,
    twoTierScore
};
