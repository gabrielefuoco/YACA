const ProfileScorer = require('../src/profile/ProfileScorer');

function createProfile(scores = {}) {
    return {
        tmdbWeight: 1,
        traktWeight: 1,
        genreScores: new Map(Object.entries(scores.genreScores || {})),
        keywordScores: new Map(Object.entries(scores.keywordScores || {})),
        directorScores: new Map(),
        actorScores: new Map(),
        studioScores: new Map(),
        eraScores: new Map(),
        countryScores: new Map(),
        runtimeScores: new Map()
    };
}

describe('ProfileScorer core taste bias', () => {
    const tmdbData = {
        id: 100,
        genre_ids: ['1'],
        keywords: { results: [{ id: '10' }] },
        vote_average: 8,
        vote_count: 1000,
        credits: { crew: [], cast: [] }
    };

    it('blends active profile and global profile with 80/20 weights', () => {
        const activeProfile = createProfile({ genreScores: { '1': 100 } });
        const globalProfile = createProfile({ genreScores: { '1': 20 } });

        const scoreA = ProfileScorer.calculateItemMatch(tmdbData, activeProfile);
        const scoreB = ProfileScorer.calculateItemMatch(tmdbData, globalProfile);
        const blended = ProfileScorer.calculateItemMatch(tmdbData, activeProfile, { globalProfile });

        expect(blended).toBeCloseTo((scoreA * 0.8) + (scoreB * 0.2), 6);
    });
});
