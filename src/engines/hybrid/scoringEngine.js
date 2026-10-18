/**
 * src/engines/hybrid/scoringEngine.js
 *
 * DECISIONE TICKET 41 (Fetta 1):
 * 1. `computeTopGenres`, `computeTopKeywords`, `extractVectorByPrefix`:
 *    VIVI in produzione (consumati da AiDiscoveryProvider e dai filtri DNA del profilo).
 *    Sono funzioni di estrazione e analisi del TasteProfile: spostati in src/profile/vectorElements.js
 *    ed esposti dalla porta src/profile/index.js.
 * 2. `calculateHybridScore`:
 *    MORTO in produzione. Era il ranker ibrido di co-occorrenza del vecchio Seed Network
 *    in catalogStrategies.js (rimosso interamente nel Ticket 46 con -1.598 righe).
 *    Zero chiamanti in src/. Viene mantenuto qui unicamente come facciata per i test unitari
 *    preesistenti (tests/scoringEngine.test.js, tests/hybridRecommendations.test.js)
 *    in attesa della loro pulizia definitiva.
 */

const { G } = require('../../catalog/filters');
const vectorElements = require('../../profile/vectorElements');

function calculateHybridScore(item, tmdbCounts, topGenres, itemGenres) {
    let score = 0;

    if (item.position !== null && item.position !== undefined) {
        score += Math.max(0, 50 - item.position);
    }

    const count = tmdbCounts.get(item.tmdbId) || 0;
    if (count > 0) {
        // Normalizzazione logaritmica sul massimo del pool
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
    computeTopGenres: vectorElements.computeTopGenres,
    computeTopKeywords: vectorElements.computeTopKeywords,
    extractVectorByPrefix: vectorElements.extractVectorByPrefix,
    calculateHybridScore
};
