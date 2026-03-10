jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'mock-id') }));

// Tests for YACA 2.0 Phase 1 mathematical improvements

describe('Phase 1.1 - Time-decay logarithmic accumulation', () => {
    // Reproduce the addWithDecay formula from ProfileBuilder
    function addWithDecay(current, increment) {
        return current + increment / (1 + Math.log(1 + Math.abs(current)));
    }

    it('should accumulate normally when current is 0', () => {
        const result = addWithDecay(0, 1.0);
        // 0 + 1.0 / (1 + ln(1)) = 0 + 1.0 / 1 = 1.0
        expect(result).toBeCloseTo(1.0);
    });

    it('should show diminishing returns as current grows', () => {
        const after1 = addWithDecay(0, 1.0);    // ~1.0
        const after2 = addWithDecay(after1, 1.0); // less than 2.0
        const after3 = addWithDecay(after2, 1.0); // less than after2+1.0
        const after4 = addWithDecay(after3, 1.0);

        // Each increment adds less than the previous
        expect(after2 - after1).toBeLessThan(after1 - 0);
        expect(after3 - after2).toBeLessThan(after2 - after1);
        expect(after4 - after3).toBeLessThan(after3 - after2);
    });

    it('should prevent the profile from going flat (decay slows but never stops)', () => {
        let score = 0;
        for (let i = 0; i < 100; i++) {
            const prev = score;
            score = addWithDecay(score, 1.0);
            // Score should always increase
            expect(score).toBeGreaterThan(prev);
        }
    });

    it('should react faster to a new genre after a different one dominated', () => {
        // Simulate watching 10 action movies (genre A scores high)
        let genreA = 0;
        for (let i = 0; i < 10; i++) genreA = addWithDecay(genreA, 1.0);

        // Then watch 10 drama movies (genre B starts from 0)
        let genreB = 0;
        const firstDramaIncrement = addWithDecay(genreB, 1.0) - genreB;
        const tenthActionIncrement = addWithDecay(genreA, 1.0) - genreA;

        // Drama increment should be larger than the next action increment (fresh start)
        expect(firstDramaIncrement).toBeGreaterThan(tenthActionIncrement);
    });
});

describe('Phase 1.2 - Rebalanced affinity (90% thematic / 10% authorial)', () => {
    const ProfileScorer = require('../src/profile/ProfileScorer');

    const makeProfile = (genreScores = {}, keywordScores = {}, directorScores = {}, actorScores = {}) => ({
        genreScores: new Map(Object.entries(genreScores)),
        keywordScores: new Map(Object.entries(keywordScores)),
        directorScores: new Map(Object.entries(directorScores)),
        actorScores: new Map(Object.entries(actorScores)),
        tmdbWeight: 1.0,
        traktWeight: 1.0
    });

    it('thematic score should dominate over authorial score', () => {
        // High thematic match, no authorial match
        const profileThematic = makeProfile({ '28': 100 }, { '1234': 50 });
        // Low thematic match, high authorial match
        const profileAuthorial = makeProfile({}, {}, { '999': 100 }, { '888': 100 });

        const tmdbData = {
            id: 1,
            genre_ids: [28],
            keywords: { keywords: [{ id: 1234 }] },
            vote_average: 7.5,
            vote_count: 1000,
            credits: {}
        };

        const scoreWithThematic = ProfileScorer.calculateItemMatch(tmdbData, profileThematic);
        const scoreWithAuthorial = ProfileScorer.calculateItemMatch(tmdbData, profileAuthorial);

        // Thematic match should give much higher score
        expect(scoreWithThematic).toBeGreaterThan(scoreWithAuthorial);
    });
});

describe('Phase 1.3 - Bayesian Weighted Rating (IMDb formula)', () => {
    const ProfileScorer = require('../src/profile/ProfileScorer');

    const makeProfile = () => ({
        genreScores: new Map(),
        keywordScores: new Map(),
        directorScores: new Map(),
        actorScores: new Map(),
        tmdbWeight: 1.0,
        traktWeight: 0.0  // Only quality score matters
    });

    it('should penalize high ratings with very few votes', () => {
        const profile = makeProfile();

        const highRatingFewVotes = {
            id: 1,
            genre_ids: [],
            vote_average: 10.0,
            vote_count: 5,     // Very few votes
            credits: {}
        };

        const highRatingManyVotes = {
            id: 2,
            genre_ids: [],
            vote_average: 8.0,
            vote_count: 5000,  // Many votes
            credits: {}
        };

        const scoreFewVotes = ProfileScorer.calculateItemMatch(highRatingFewVotes, profile);
        const scoreManyVotes = ProfileScorer.calculateItemMatch(highRatingManyVotes, profile);

        // A 10/10 with 5 votes should score lower than an 8.0 with 5000 votes
        expect(scoreFewVotes).toBeLessThan(scoreManyVotes);
    });

    it('should converge towards mean vote (6.5) for items with zero votes', () => {
        const profile = makeProfile();

        const zeroVoteItem = {
            id: 1,
            genre_ids: [],
            vote_average: 0,
            vote_count: 0,
            credits: {}
        };

        const score = ProfileScorer.calculateItemMatch(zeroVoteItem, profile);

        // With 0 votes, Bayesian score = C = 6.5 (weighted by tmdbWeight=1, traktWeight=0)
        // normalizedScore = (0 * 0 + 6.5 * 1) / 1 = 6.5
        // Without epsilon, the score should stay centered on the 6.5 Bayesian mean
        expect(score).toBeGreaterThan(6.4);
        expect(score).toBeLessThan(6.6);
    });
});

describe('Phase 1.4 - Stable scoring without epsilon tracker', () => {
    const ProfileScorer = require('../src/profile/ProfileScorer');

    const makeProfile = () => ({
        genreScores: new Map(),
        keywordScores: new Map(),
        directorScores: new Map(),
        actorScores: new Map(),
        tmdbWeight: 1.0,
        traktWeight: 1.0
    });

    it('identical items should keep the same score even when TMDB ids differ', () => {
        const profile = makeProfile();

        // Two identical items except for ID
        const item1 = { id: 100, genre_ids: [], vote_average: 7.0, vote_count: 1000, credits: {} };
        const item2 = { id: 101, genre_ids: [], vote_average: 7.0, vote_count: 1000, credits: {} };

        const score1 = ProfileScorer.calculateItemMatch(item1, profile);
        const score2 = ProfileScorer.calculateItemMatch(item2, profile);

        expect(score1).toBeCloseTo(score2, 10);
    });

    it('scores remain deterministic for repeated calls on the same item', () => {
        const profile = makeProfile();

        const item = { id: 12345, genre_ids: [], vote_average: 7.0, vote_count: 1000, credits: {} };

        const firstScore = ProfileScorer.calculateItemMatch(item, profile);
        const secondScore = ProfileScorer.calculateItemMatch(item, profile);

        expect(firstScore).toBeCloseTo(secondScore, 10);
    });
});

describe('ProfileScorer.applyDiversityCaps', () => {
    const ProfileScorer = require('../src/profile/ProfileScorer');

    it('should return items unchanged when no caps are exceeded', () => {
        const items = [
            { id: 1, genre_ids: [28], credits: { crew: [] } },
            { id: 2, genre_ids: [35], credits: { crew: [] } },
            { id: 3, genre_ids: [18], credits: { crew: [] } }
        ];
        const result = ProfileScorer.applyDiversityCaps(items, { genre: 10, director: 3 });
        expect(result.length).toBe(3);
    });

    it('should filter items exceeding genre cap', () => {
        const items = Array.from({ length: 15 }, (_, i) => ({
            id: i + 1,
            genre_ids: [28], // All same genre
            credits: { crew: [] }
        }));
        const result = ProfileScorer.applyDiversityCaps(items, { genre: 10, director: 3 });
        expect(result.length).toBe(10); // Capped at 10
    });

    it('should filter items exceeding director cap', () => {
        const items = Array.from({ length: 5 }, (_, i) => ({
            id: i + 1,
            genre_ids: [28 + i], // Different genres
            credits: { crew: [{ id: 999, job: 'Director' }] } // Same director
        }));
        const result = ProfileScorer.applyDiversityCaps(items, { genre: 10, director: 3 });
        expect(result.length).toBe(3); // Capped at 3 for this director
    });

    it('should return empty array for empty input', () => {
        const result = ProfileScorer.applyDiversityCaps([]);
        expect(result).toEqual([]);
    });
});

describe('Phase 2.1 - OR logic in hybrid recommendations queries', () => {
    it('computeTopGenres returns top N genres from profile', () => {
        const { computeTopGenres } = require('../src/engines/hybridRecommendations');

        const profile = {
            genreScores: new Map([
                ['28', 100],
                ['35', 50],
                ['18', 30],
                ['27', 20],
                ['16', 10]
            ])
        };

        const top3 = computeTopGenres(profile, 3);
        expect(top3).toEqual(['28', '35', '18']);
    });

    it('computeTopGenres handles empty profile', () => {
        const { computeTopGenres } = require('../src/engines/hybridRecommendations');

        const emptyProfile = { genreScores: new Map() };
        expect(computeTopGenres(emptyProfile, 5)).toEqual([]);
    });

    it('computeTopGenres returns all genres when n > available', () => {
        const { computeTopGenres } = require('../src/engines/hybridRecommendations');

        const profile = {
            genreScores: new Map([['28', 100], ['35', 50]])
        };
        const top5 = computeTopGenres(profile, 5);
        expect(top5.length).toBe(2);
    });
});

describe('Phase 3 - Cache TTL constants', () => {
    const config = require('../src/config');

    it('SCORING_DATA_TTL_MS should be 14 days', () => {
        expect(config.SCORING_DATA_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
    });

    it('MOVIE_PRESENTATION_TTL_MS should be 14 days', () => {
        expect(config.MOVIE_PRESENTATION_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
    });

    it('MOVIE_PRESENTATION_SWR_MS should be 7 days', () => {
        expect(config.MOVIE_PRESENTATION_SWR_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('SERIES_ONGOING_PRESENTATION_TTL_MS should be 12 hours', () => {
        expect(config.SERIES_ONGOING_PRESENTATION_TTL_MS).toBe(12 * 60 * 60 * 1000);
    });

    it('SERIES_ONGOING_PRESENTATION_SWR_MS should be 30 minutes', () => {
        expect(config.SERIES_ONGOING_PRESENTATION_SWR_MS).toBe(30 * 60 * 1000);
    });

    it('BAYESIAN_MIN_VOTES should be 300', () => {
        expect(config.BAYESIAN_MIN_VOTES).toBe(300);
    });

    it('BAYESIAN_MEAN_VOTE should be 6.5', () => {
        expect(config.BAYESIAN_MEAN_VOTE).toBe(6.5);
    });
});

describe('fetchTmdbSimilarCounts', () => {
    it('should be exported from hybridRecommendations', () => {
        const { fetchTmdbSimilarCounts } = require('../src/engines/hybridRecommendations');
        expect(typeof fetchTmdbSimilarCounts).toBe('function');
    });

    it('should return empty Map for empty seed list', async () => {
        const { fetchTmdbSimilarCounts } = require('../src/engines/hybridRecommendations');
        const result = await fetchTmdbSimilarCounts([], 'fake-key', 'movie');
        expect(result instanceof Map).toBe(true);
        expect(result.size).toBe(0);
    });
});
