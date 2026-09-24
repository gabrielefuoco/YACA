const { getProfileDnaFilters } = require('../../utils/helpers');
const { G } = require('../../data/filters');
const { isRetiredTmdbKeywordId } = require('../../data/keywordIds');

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
        if (filterType === 'keyword') {
            Object.keys(scores).forEach(id => {
                if (isRetiredTmdbKeywordId(id)) delete scores[id];
            });
        }
    }
    
    const dnaFilters = getProfileDnaFilters(user, context);
    dnaFilters.filter(f => f.type === filterType).forEach(f => {
        const id = String(f.id);
        if (filterType === 'keyword' && isRetiredTmdbKeywordId(id)) return;
        if (!scores[id]) scores[id] = 100;
        else scores[id] += 50;
    });

    return Object.entries(scores)
        .sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])))
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

    const expandGenreIds = (genres) => new Set((genres || []).flatMap(genre => {
        const id = Number(genre);
        if (!Number.isFinite(id)) return [];
        return [String(id), ...G.getEquivalentGenreIds(id).map(String)];
    }));
    const itemGenreIds = expandGenreIds(itemGenres);
    const genreBoosts = [30, 15, 5];
    const limit = Math.min(topGenres.length, genreBoosts.length);
    for (let i = 0; i < limit; i++) {
        const topId = Number(topGenres[i]);
        if (!Number.isFinite(topId)) continue;
        const equivalents = [String(topId), ...G.getEquivalentGenreIds(topId).map(String)];
        if (equivalents.some(id => itemGenreIds.has(id))) score += genreBoosts[i];
    }

    return score;
}







module.exports = {
    computeTopGenres,
    computeTopKeywords,
    calculateHybridScore,
    extractVectorByPrefix
};
