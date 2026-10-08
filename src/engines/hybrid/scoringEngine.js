const { getProfileDnaFilters } = require('../../utils/helpers');
const { G } = require('../../data/filters');
const { isRetiredTmdbKeywordId, keywordIdForName } = require('../../data/keywordIds');

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
            // Il vettore porta la stessa keyword in DUE forme: `k:<id>` e `k:<nome>`
            // (la seconda è quella che il grafo gerarchico sa leggere). Chi consuma
            // `computeTopKeywords` le usa però come ID — filtri DuckDB e `with_keywords`
            // di TMDB discover — quindi qui si tiene solo la forma numerica,
            // risolvendo i nomi con la mappa del dump e scartando ciò che non si
            // risolve invece di propagare una stringa dove serve un id.
            const normalized = {};
            for (const [key, value] of Object.entries(scores)) {
                if (isRetiredTmdbKeywordId(key)) continue;
                const id = /^\d+$/.test(key) ? key : keywordIdForName(key);
                if (!id) continue;
                // Stessa keyword su due chiavi: si tiene il peso maggiore, non la
                // somma, altrimenti quella keyword peserebbe il doppio delle altre.
                normalized[id] = Math.max(normalized[id] || 0, Number(value) || 0);
            }
            scores = normalized;
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
        // Ticket 13: il vecchio 100/2^(count-1) faceva crollare il punteggio dopo
        // il primo hop (loved+liked = 7 -> 1) e la convergenza multi-seme spariva.
        // Normalizzazione logaritmica sul massimo del pool: monotona crescente,
        // saturante e con il candidato più sostenuto ancorato a 100.
        let maxCount = count;
        for (const value of tmdbCounts.values()) {
            if (Number.isFinite(value) && value > maxCount) maxCount = value;
        }
        score += 100 * (Math.log1p(count) / Math.log1p(maxCount));
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
