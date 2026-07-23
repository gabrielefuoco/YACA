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

function computeTopElements(profile, prefix, filterType, n = 5, user = null, context = 'global') {
    let scores = {};
    const vFinal = profile?.compiledVectors?.V_final;
    if (vFinal && Object.keys(vFinal).length > 0) {
        scores = extractVectorByPrefix(vFinal, prefix);
    }
    
    const dnaFilters = getProfileDnaFilters(user, context);
    dnaFilters.filter(f => f.type === filterType).forEach(f => {
        const id = String(f.id);
        if (!scores[id]) scores[id] = 100;
        else scores[id] += 50;
    });

    return Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(e => String(e[0]));
}

function computeTopGenres(profile, n = 5, user = null, context = 'global') {
    return computeTopElements(profile, 'g', 'genre', n, user, context);
}

function computeTopKeywords(profile, n = 3, user = null, context = 'global') {
    return computeTopElements(profile, 'k', 'keyword', n, user, context);
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



module.exports = {
    computeTopGenres,
    computeTopKeywords,
    calculateHybridScore,
    saveScoringData,
    extractVectorByPrefix
};
