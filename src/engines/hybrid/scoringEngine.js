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
    const suggestedIds = dnaFilters
        .filter(f => f.type === filterType)
        .map(f => String(f.id))
        .filter(id => filterType !== 'keyword' || !isRetiredTmdbKeywordId(id));
    const suggestedSet = new Set(suggestedIds);

    // Ordina gli elementi dal vettore reale V_final per score decrescente
    // (a parità di score, usa la presenza in suggestedDNA come tie-breaker)
    const sortedFromVector = Object.entries(scores)
        .sort((a, b) => {
            const diff = b[1] - a[1];
            if (Math.abs(diff) > 0.0001) return diff;
            const aBonus = suggestedSet.has(String(a[0])) ? 1 : 0;
            const bBonus = suggestedSet.has(String(b[0])) ? 1 : 0;
            if (bBonus !== aBonus) return bBonus - aBonus;
            return String(a[0]).localeCompare(String(b[0]));
        })
        .map(e => String(e[0]));

    const result = sortedFromVector.slice(0, n);

    // Fallback: se il vettore reale ha meno di n elementi, usa suggestedDNA
    if (result.length < n) {
        for (const id of suggestedIds) {
            if (!result.includes(id)) {
                result.push(id);
                if (result.length >= n) break;
            }
        }
    }

    return result;
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
