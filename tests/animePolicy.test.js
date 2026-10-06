const {
    ANIME_POLICY_MODES,
    getProfileAnimationQuota,
    getPolicyFromQuota,
    resolveAnimePolicy,
    getEffectiveTypeSelectors,
    isItemAnime,
    computeAnimeScoreMultiplier
} = require('../src/engines/hybrid/animePolicy');
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

    describe('Calcolo Quota da V_final e fallbacks', () => {
        it('calcola quota g:16 su totale g:* con V_final oggetto', () => {
            const profile = {
                compiledVectors: {
                    V_final: {
                        'g:16': 10,
                        'g:28': 30,
                        'g:12': 10,
                        'k:1234': 50 // le keyword non devono entrare nel totale generi
                    }
                }
            };
            // 10 / (10 + 30 + 10) = 10 / 50 = 0.20 -> neutral
            const quota = getProfileAnimationQuota(profile);
            expect(quota).toBeCloseTo(0.20, 4);
            expect(resolveAnimePolicy(profile)).toBe(ANIME_POLICY_MODES.NEUTRAL);
        });

        it('calcola quota con V_final Map', () => {
            const map = new Map([
                ['g:16', 83],
                ['g:35', 17],
                ['d:999', 10]
            ]);
            const profile = { compiledVectors: { V_final: map } };
            // 83 / 100 = 0.83 -> only (Otaku 1c1da0af)
            const quota = getProfileAnimationQuota(profile);
            expect(quota).toBeCloseTo(0.83, 4);
            expect(resolveAnimePolicy(profile)).toBe(ANIME_POLICY_MODES.ONLY);
        });

        it('classifica profilo 0465f104 (serie TV, 6.6% animazione) come exclude', () => {
            const profile = {
                compiledVectors: {
                    V_final: {
                        'g:16': 0.5513,
                        'g:18': 4.5,
                        'g:80': 3.2578
                    }
                }
            };
            const quota = getProfileAnimationQuota(profile);
            expect(quota).toBeLessThan(0.10);
            expect(resolveAnimePolicy(profile)).toBe(ANIME_POLICY_MODES.EXCLUDE);
        });

        it('supporta profili legacy con genreScores', () => {
            const profile = {
                genreScores: {
                    '16': 30,
                    '28': 70
                }
            };
            // 30 / 100 = 0.30 -> favored
            expect(resolveAnimePolicy(profile)).toBe(ANIME_POLICY_MODES.FAVORED);
        });
    });

    describe('Override Manuale (typeSelectors)', () => {
        it('typeSelectors.anime manuale vince sempre sulla quota DNA', () => {
            // Otaku (DNA 83%) con override manuale exclude
            const otakuProfile = {
                compiledVectors: { V_final: { 'g:16': 83, 'g:35': 17 } }
            };
            expect(resolveAnimePolicy(otakuProfile, { anime: 'exclude' })).toBe(ANIME_POLICY_MODES.EXCLUDE);

            // Serie TV (DNA 6.6%) con override manuale only
            const serieProfile = {
                compiledVectors: { V_final: { 'g:16': 0.55, 'g:18': 8.0 } }
            };
            expect(resolveAnimePolicy(serieProfile, { anime: 'only' })).toBe(ANIME_POLICY_MODES.ONLY);
        });

        it('rispetta profile.settings.typeSelectors.anime', () => {
            const profileWithSetting = {
                compiledVectors: { V_final: { 'g:16': 0.05, 'g:18': 0.95 } },
                settings: { typeSelectors: { anime: 'only' } }
            };
            expect(resolveAnimePolicy(profileWithSetting)).toBe(ANIME_POLICY_MODES.ONLY);
        });

        it('getEffectiveTypeSelectors produce l\'oggetto typeSelectors arricchito', () => {
            const profile = { compiledVectors: { V_final: { 'g:16': 80, 'g:28': 20 } } };
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
                compiledVectors: {
                    V_final: { 'g:18': 10, 'g:80': 10, 'g:16': 0.1 } // quota < 10%
                }
            };
            const neutralContext = { animePolicy: 'neutral' };
            const excludeContext = {}; // deduce exclude da V_final

            const scoreNeutral = ProfileScorer.calculateItemMatch(animeMovie, excludeProfile, neutralContext);
            const scoreExclude = ProfileScorer.calculateItemMatch(animeMovie, excludeProfile, excludeContext);

            expect(scoreExclude).toBeCloseTo(scoreNeutral * 0.40, 4);
        });

        it('ProfileScorer.calculateItemMatch applica il boost 1.25 ad anime in un profilo only', () => {
            const onlyProfile = {
                tmdbWeight: 1,
                traktWeight: 1,
                compiledVectors: {
                    V_final: { 'g:16': 10, 'g:18': 1 } // quota >= 60%
                }
            };
            // Usiamo un item con punteggio non saturato a 10
            const modAnime = { ...animeMovie, vote_average: 6.5, vote_count: 500 };
            const scoreNeutral = ProfileScorer.calculateItemMatch(modAnime, onlyProfile, { animePolicy: 'neutral' });
            const scoreOnly = ProfileScorer.calculateItemMatch(modAnime, onlyProfile, {});

            expect(scoreOnly).toBeCloseTo(Math.min(10, scoreNeutral * 1.25), 4);
        });
    });
});
