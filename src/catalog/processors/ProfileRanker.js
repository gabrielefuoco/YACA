const ProfileScorer = require('../../profile/ProfileScorer');
const { hydrateResultsFromLocalDetailsCache } = require('./MetadataHydrator');

async function rerankMergedPage(results, profileDoc, globalProfileDoc, tmdbApiKey, type, dnaFilters = []) {
    if (!profileDoc || !Array.isArray(results) || results.length === 0) return results;

    // Assicurarsi di passare isLandscapeEnabled = false o null qui, se non serve
    await hydrateResultsFromLocalDetailsCache(results, tmdbApiKey, type, false);
    
    return [...results]
        .map((item, index) => {
            const affinity = ProfileScorer.calculateItemMatch(item.rawTMDB || item, profileDoc, {
                globalProfile: globalProfileDoc,
                dnaFilters
            });
            return {
                item,
                affinity,
                finalScore: affinity + ((item.popularity || 0) / 1000),
                index
            };
        })
        .sort((a, b) => {
            if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
            if ((b.item.popularity || 0) !== (a.item.popularity || 0)) return (b.item.popularity || 0) - (a.item.popularity || 0);
            return a.index - b.index;
        })
        .map(entry => entry.item);
}

module.exports = { rerankMergedPage };
