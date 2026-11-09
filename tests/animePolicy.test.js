const {
    ANIME_POLICY_MODES,
    getProfileAnimationQuota,
    getPolicyFromQuota,
    resolveAnimePolicy,
    getEffectiveTypeSelectors,
    isItemAnime,
    computeAnimeScoreMultiplier
} = require('../src/anime');
const ProfileScorer = require('../src/profile/ProfileScorer');

describe('Anime Policy (Ticket 26)', () => {
    describe('Soglie DNA -> Modo', () => {
        it('mappa quota >= 60% in only', () => {
            expect(getPolicyFromQuota(0.60)).toBe(ANIME_POLICY_MODES.ONLY);
            expect(getPolicyFromQuota(0.83)).toBe(ANIME_POLICY_MODES.ONLY);
            expect(getPolicyFromQuota(1.0)).toBe(ANIME_POLICY_MODES.ONLY);
        });

        it('mappa quota 25-60% in favored', () => {
            expect(getPolicyFromQuota(0.25)).toBe(ANIME_POLICY_MODES.FAVORED);
            expect(getPolicyFromQuota(0.40)).toBe(ANIME_POLICY_MODES.FAVORED);
            expect(getPolicyFromQuota(0.599)).toBe(ANIME_POLICY_MODES.FAVORED);
        });

        it('mappa quota 10-25% in neutral', () => {
            expect(getPolicyFromQuota(0.10)).toBe(ANIME_POLICY_MODES.NEUTRAL);
            expect(getPolicyFromQuota(0.18)).toBe(ANIME_POLICY_MODES.NEUTRAL);
            expect(getPolicyFromQuota(0.249)).toBe(ANIME_POLICY_MODES.NEUTRAL);
        });

        it('mappa quota < 10% in exclude', () => {
            expect(getPolicyFromQuota(0.099)).toBe(ANIME_POLICY_MODES.EXCLUDE);
            expect(getPolicyFromQuota(0.066)).toBe(ANIME_POLICY_MODES.EXCLUDE); // 0465f104 baseline
            expect(getPolicyFromQuota(0.001)).toBe(ANIME_POLICY_MODES.EXCLUDE);
            expect(getPolicyFromQuota(0.0)).toBe(ANIME_POLICY_MODES.EXCLUDE);
        });

        it('mappa profili privi di segnali di genere in neutral per evitare falsi positivi', () => {
            expect(getPolicyFromQuota(null)).toBe(ANIME_POLICY_MODES.NEUTRAL);
            expect(getPolicyFromQuota(undefined)).toBe(ANIME_POLICY_MODES.NEUTRAL);
            expect(getPolicyFromQuota(NaN)).toBe(ANIME_POLICY_MODES.NEUTRAL);
        });
    });

    describe('Comportamento di default e Override Manuale (typeSelectors)', () => {
        it('in assenza di override la politica di default è neutral', () => {
            expect(resolveAnimePolicy({})).toBe(ANIME_POLICY_MODES.NEUTRAL);
            expect(resolveAnimePolicy(null)).toBe(ANIME_POLICY_MODES.NEUTRAL);
        });

        it('rispetta typeSelectors.anime passato nella richiesta', () => {
            expect(resolveAnimePolicy({}, { anime: 'exclude' })).toBe(ANIME_POLICY_MODES.EXCLUDE);
            expect(resolveAnimePolicy({}, { anime: 'only' })).toBe(ANIME_POLICY_MODES.ONLY);
        });

        it('rispetta profile.settings.typeSelectors.anime', () => {
            const profileWithSetting = {
                settings: { typeSelectors: { anime: 'only' } }
            };
            expect(resolveAnimePolicy(profileWithSetting)).toBe(ANIME_POLICY_MODES.ONLY);
        });

        it('getEffectiveTypeSelectors produce l\'oggetto typeSelectors arricchito', () => {
            const profile = { settings: { typeSelectors: { anime: 'only' } } };
            const effective = getEffectiveTypeSelectors(profile, { customFilter: 'foo' });
            expect(effective).toEqual({
                customFilter: 'foo',
                anime: 'only'
            });
        });
    });

    describe('Sede 2: Punteggio (ProfileScorer)', () => {
        const animeMovie = {
            id: 12345,
            title: 'Your Name',
            genre_ids: [16, 18, 10749],
            original_language: 'ja',
            vote_average: 8.5,
            vote_count: 5000
        };

        const westernAnimationMovie = {
            id: 54321,
            title: 'WALL-E',
            genre_ids: [16, 10751],
            original_language: 'en',
            vote_average: 8.4,
            vote_count: 10000
        };

        const liveActionMovie = {
            id: 99999,
            title: 'The Godfather',
            genre_ids: [18, 80],
            original_language: 'en',
            vote_average: 9.0,
            vote_count: 15000
        };

        it('identifica correttamente anime giapponese vs animazione occidentale', () => {
            expect(isItemAnime(animeMovie)).toBe(true);
            expect(isItemAnime(westernAnimationMovie)).toBe(false);
            expect(isItemAnime(liveActionMovie)).toBe(false);
        });

        it('computeAnimeScoreMultiplier applica i moltiplicatori corretti', () => {
            // only: ×1.25 anime, ×0.40 non-anime
            expect(computeAnimeScoreMultiplier(animeMovie, 'only')).toBe(1.25);
            expect(computeAnimeScoreMultiplier(westernAnimationMovie, 'only')).toBe(0.40);
            expect(computeAnimeScoreMultiplier(liveActionMovie, 'only')).toBe(0.40);

            // favored: ×1.15 anime, ×0.85 non-anime (moltiplicatore simmetrico)
            expect(computeAnimeScoreMultiplier(animeMovie, 'favored')).toBe(1.15);
            expect(computeAnimeScoreMultiplier(liveActionMovie, 'favored')).toBe(0.85);
            expect(computeAnimeScoreMultiplier(westernAnimationMovie, 'favored')).toBe(0.85);

            // neutral: ×1.00
            expect(computeAnimeScoreMultiplier(animeMovie, 'neutral')).toBe(1.00);
            expect(computeAnimeScoreMultiplier(liveActionMovie, 'neutral')).toBe(1.00);

            // exclude: ×0.40 anime, ×1.00 non-anime
            expect(computeAnimeScoreMultiplier(animeMovie, 'exclude')).toBe(0.40);
            expect(computeAnimeScoreMultiplier(liveActionMovie, 'exclude')).toBe(1.00);
            expect(computeAnimeScoreMultiplier(westernAnimationMovie, 'exclude')).toBe(1.00);
        });

        it('ProfileScorer.computeAnimeMultiplier usa context.animePolicy se passato', () => {
            const mult = ProfileScorer.computeAnimeMultiplier(animeMovie, {}, { animePolicy: 'exclude' });
            expect(mult).toBe(0.40);
        });

        it('ProfileScorer.calculateItemMatch applica la penalità 0.4 ad anime in un profilo exclude', () => {
            const excludeProfile = {
                tmdbWeight: 1,
                traktWeight: 1,
                settings: {
                    typeSelectors: { anime: 'exclude' }
                }
            };
            const neutralContext = { animePolicy: 'neutral' };
            const excludeContext = {}; // deduce exclude da profile settings

            const scoreNeutral = ProfileScorer.calculateItemMatch(animeMovie, excludeProfile, neutralContext);
            const scoreExclude = ProfileScorer.calculateItemMatch(animeMovie, excludeProfile, excludeContext);

            expect(scoreExclude).toBeCloseTo(scoreNeutral * 0.40, 4);
        });

        it('ProfileScorer.calculateItemMatch applica il boost 1.25 ad anime in un profilo only', () => {
            const onlyProfile = {
                tmdbWeight: 1,
                traktWeight: 1,
                settings: {
                    typeSelectors: { anime: 'only' }
                }
            };
            // Usiamo un item con punteggio non saturato a 10
            const modAnime = { ...animeMovie, vote_average: 6.5, vote_count: 500 };
            const scoreNeutral = ProfileScorer.calculateItemMatch(modAnime, onlyProfile, { animePolicy: 'neutral' });
            const scoreOnly = ProfileScorer.calculateItemMatch(modAnime, onlyProfile, {});

            expect(scoreOnly).toBeCloseTo(Math.min(10, scoreNeutral * 1.25), 4);
        });
    });

    describe('Inoltro tipo a store su voci di pool (Ticket 13)', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('voce di pool con solo id inoltra esattamente movie e tv allo store', () => {
            const { animeMappingStore } = require('../src/anime');
            const calls = [];
            jest.spyOn(animeMappingStore, 'isAnimeTmdbId').mockImplementation((id, tipo) => {
                calls.push({ id, tipo });
                return tipo === 'tv';
            });

            // Voce di pool con solo id (nessun genres, nessun type)
            const poolItemMovie = { id: '38251', matchScore: 90 };
            const isMovie = isItemAnime(poolItemMovie, 'movie');

            const poolItemTv = { id: '38251', matchScore: 90 };
            const isTv = isItemAnime(poolItemTv, 'tv');

            expect(calls).toEqual([
                { id: '38251', tipo: 'movie' },
                { id: '38251', tipo: 'tv' }
            ]);
            expect(isMovie).toBe(false);
            expect(isTv).toBe(true);
        });

        it('computeAnimeScoreMultiplier inoltra tipo alla voce di pool', () => {
            const { animeMappingStore } = require('../src/anime');
            const calls = [];
            jest.spyOn(animeMappingStore, 'isAnimeTmdbId').mockImplementation((id, tipo) => {
                calls.push({ id, tipo });
                return tipo === 'tv';
            });

            const poolItemMovie = { id: '38251', matchScore: 90 };
            const multMovie = computeAnimeScoreMultiplier(poolItemMovie, 'only', 'movie');

            const poolItemTv = { id: '38251', matchScore: 90 };
            const multTv = computeAnimeScoreMultiplier(poolItemTv, 'only', 'tv');

            expect(calls).toEqual([
                { id: '38251', tipo: 'movie' },
                { id: '38251', tipo: 'tv' }
            ]);
            expect(multMovie).toBe(0.40);
            expect(multTv).toBe(1.25);
        });
    });
});
