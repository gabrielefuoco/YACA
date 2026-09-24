const {
    getHybridCatalog,
    buildHybridCatalog,
    buildDirectPresetCatalog,
    fetchPopularFallbackIds,
    getActiveKidsMode,
    buildRecommendationCacheKey
} = require('../src/engines/hybridRecommendations');
const TasteProfile = require('../src/models/TasteProfile');
const tmdb = require('../src/clients/tmdb');
const { traktClient, smartTraktRefresh } = require('../src/clients/trakt');
const {
    getDuckDbCatalogFromFilters,
    getDuckDbCatalogFromPreset,
    getDuckDbMetaDetails,
    buildPresetFromFilters,
    applyKidsModeToPreset
} = require('../src/catalog/providers/DuckDbProvider');
const { applyKidsMode, isItemInappropriateForKids } = require('../src/utils/kidsModeFilters');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const { hybridRecommendationsCache } = require('../src/cache/cacheInstances');

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true })
}));
jest.mock('../src/models/RecommendationImpression', () => ({
    bulkWrite: jest.fn().mockResolvedValue(null)
}));
jest.mock('../src/db/models/UserAccount');
jest.mock('../src/db/models/AddonConfig');
jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn().mockResolvedValue(null)
}));
jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return {
        ...actual,
        getDuckDbCatalogFromPreset: jest.fn(),
        getDuckDbCatalogFromFilters: jest.fn(),
        getDuckDbMetaDetails: jest.fn()
    };
});
jest.mock('../src/cache/cacheInstances', () => ({
    hybridRecommendationsCache: {
        getWithStatus: jest.fn().mockResolvedValue({ value: null, status: 'miss' }),
        set: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(null),
        clear: jest.fn().mockResolvedValue(null)
    }
}));

jest.mock('../src/clients/trakt', () => ({
    traktClient: {
        get: jest.fn()
    },
    smartTraktRefresh: jest.fn()
}));

jest.mock('../src/clients/tmdb', () => ({
    createTmdbClient: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
            data: { id: 1, title: 'Default', genre_ids: [16] }
        })
    })),
    getTmdbMovieDetails: jest.fn(),
    prioritizeLocalizedImages: jest.fn(arr => arr)
}));

describe('Ticket 12: Hero Policy & Trakt Fixes', () => {
    const origEnv = process.env.TRAKT_CLIENT_ID;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.TRAKT_CLIENT_ID = 'test_trakt_id';
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                userId: 'user_1',
                addonUuid: 'uuid_1',
                apiKeys: {
                    trakt: 'old_token',
                    traktRefreshToken: 'valid_refresh_token'
                }
            })
        });
        AddonConfig.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                uuid: 'uuid_1',
                userId: 'user_1',
                apiKeys: {
                    trakt: 'old_token',
                    traktRefreshToken: 'valid_refresh_token'
                }
            })
        });
        TasteProfile.findOne.mockResolvedValue({
            owner: 'user_1',
            context: 'global',
            compiledVectors: { V_final: { 'g:16': 10 } },
            settings: {},
            lastUpdated: new Date()
        });
    });

    afterAll(() => {
        process.env.TRAKT_CLIENT_ID = origEnv;
    });

    const createKidsUserConfig = (context = 'kids_profile', configVersion = 'cfg-v1') => ({
        userId: 'user_1',
        activeProfileId: context,
        configVersion,
        apiKeys: { tmdb: 'tmdb_key' },
        profiles: [{
            id: context,
            settings: { kidsMode: true, typeSelectors: {} }
        }]
    });

    describe('BUG-4: Trakt 403 → refresh tentato → fallback popolato', () => {
        it('trakt_filtered_movies triggers refresh on 403 and falls back to popular movies when trakt is empty', async () => {
            // Profile setup: user has a valid profile
            TasteProfile.findOne.mockResolvedValue({
                owner: 'user_1',
                context: 'global',
                compiledVectors: { V_final: {} },
                settings: {}
            });

            // Trakt responds 403 on initial call
            const error403 = new Error('Forbidden');
            error403.response = { status: 403 };
            traktClient.get.mockRejectedValue(error403);

            // smartTraktRefresh is called and fails to recover or Trakt still returns 403
            smartTraktRefresh.mockResolvedValueOnce({
                access_token: 'refreshed_token',
                refresh_token: 'new_refresh'
            });

            // DuckDb returns popular items for fallback
            getDuckDbCatalogFromFilters.mockResolvedValue([
                { id: '101', title: 'Popular Fallback Movie 1', vote_count: 500, release_date: '2023-01-01' },
                { id: '102', title: 'Popular Fallback Movie 2', vote_count: 600, release_date: '2023-02-01' }
            ]);

            getDuckDbMetaDetails.mockImplementation((id) => Promise.resolve({
                rawTMDB: {
                    id,
                    title: `Popular Fallback Movie ${id}`,
                    overview: 'Great fallback movie',
                    release_date: '2023-01-01',
                    vote_average: 7.5,
                    genre_ids: [28]
                }
            }));

            const results = await getHybridCatalog(
                'yaca_trakt_filtered_movies',
                0,
                'old_token',
                'tmdb_key',
                'user_1',
                'global'
            );

            // 1. Refresh was attempted on 403
            expect(smartTraktRefresh).toHaveBeenCalledWith('user_1', 'valid_refresh_token');

            // 2. Catalog did NOT end up empty; it was populated via popular fallback
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].name).toContain('Popular Fallback Movie');
            expect(results[0].type).toBe('movie');
        });

        it('trakt_filtered_series triggers refresh on 403 and falls back to popular series', async () => {
            TasteProfile.findOne.mockResolvedValue({
                owner: 'user_1',
                context: 'global',
                compiledVectors: { V_final: {} },
                settings: {}
            });

            const error403 = new Error('Forbidden');
            error403.response = { status: 403 };
            traktClient.get.mockRejectedValue(error403);

            smartTraktRefresh.mockResolvedValueOnce({
                access_token: 'refreshed_token',
                refresh_token: 'new_refresh'
            });

            getDuckDbCatalogFromFilters.mockResolvedValue([
                { id: '201', title: 'Popular Fallback Series 1', vote_count: 400 }
            ]);

            getDuckDbMetaDetails.mockImplementation((id) => Promise.resolve({
                rawTMDB: {
                    id,
                    name: `Popular Fallback Series ${id}`,
                    overview: 'Great fallback series',
                    first_air_date: '2022-01-01',
                    vote_average: 8.0,
                    genre_ids: [18]
                }
            }));

            const results = await getHybridCatalog(
                'yaca_trakt_filtered_series',
                0,
                'old_token',
                'tmdb_key',
                'user_1',
                'global'
            );

            expect(smartTraktRefresh).toHaveBeenCalled();
            expect(results.length).toBe(1);
            expect(results[0].type).toBe('series');
            expect(results[0].name).toContain('Popular Fallback Series');
        });

        it('trakt_filtered succeeds with refreshed token if second attempt returns items', async () => {
            TasteProfile.findOne.mockResolvedValue({
                owner: 'user_1',
                context: 'global',
                compiledVectors: { V_final: {} },
                settings: {}
            });

            const error403 = new Error('Forbidden');
            error403.response = { status: 403 };

            // 1st call fails 403, 2nd call succeeds with items
            traktClient.get
                .mockRejectedValueOnce(error403)
                .mockResolvedValueOnce({
                    data: [
                        { movie: { ids: { tmdb: 301 } } }
                    ]
                });

            smartTraktRefresh.mockResolvedValueOnce({
                access_token: 'valid_token_now',
                refresh_token: 'new_refresh_token'
            });

            tmdb.getTmdbMovieDetails.mockResolvedValue({
                id: 301,
                title: 'Trakt Recommended Movie',
                vote_count: 500,
                vote_average: 8.2,
                genre_ids: [12]
            });

            getDuckDbMetaDetails.mockResolvedValue({
                rawTMDB: {
                    id: 301,
                    title: 'Trakt Recommended Movie',
                    vote_count: 500,
                    vote_average: 8.2,
                    genre_ids: [12],
                    release_date: '2023-05-01'
                }
            });

            const results = await getHybridCatalog(
                'yaca_trakt_filtered_movies',
                0,
                'old_token',
                'tmdb_key',
                'user_1',
                'global'
            );

            expect(smartTraktRefresh).toHaveBeenCalledWith('user_1', 'valid_refresh_token');
            expect(results.length).toBe(1);
            expect(results[0].name).toBe('Trakt Recommended Movie');
        });
    });

    describe('BUG-8: kidsMode hard-filter sugli hero', () => {
        it('applyKidsMode correctly excludes adult genres and adult keywords', () => {
            const safeItem = { id: '1', title: 'Safe Animation', genre_ids: [16, 10751], keywords: [{ id: 100 }] };
            const horrorItem = { id: '2', title: 'Horror Blood', genre_ids: [27], keywords: [] };
            const thrillerItem = { id: '3', title: 'Thriller Mystery', genre_ids: [53] };
            const crimeItem = { id: '4', title: 'Gangster Crime', genre_ids: [80] };
            const hentaiItem = { id: '5', title: 'Adult Keyword', genre_ids: [16], keywords: [{ id: 198385 }] };
            const goreItem = { id: '6', title: 'Gore Item', genre_ids: [28], keywords: [{ id: 10292 }] };
            const semanticAdultItems = [161919, 11192, 9964, 204950, 220192].map((keywordId, index) => ({
                id: String(index + 7),
                title: `Semantic adult ${keywordId}`,
                genre_ids: [16, 35],
                keywords: [{ id: keywordId }]
            }));

            expect(isItemInappropriateForKids(safeItem)).toBe(false);
            expect(isItemInappropriateForKids(horrorItem)).toBe(true);
            expect(isItemInappropriateForKids(thrillerItem)).toBe(true);
            expect(isItemInappropriateForKids(crimeItem)).toBe(true);
            expect(isItemInappropriateForKids(hentaiItem)).toBe(true);
            expect(isItemInappropriateForKids(goreItem)).toBe(true);
            semanticAdultItems.forEach(item => expect(isItemInappropriateForKids(item)).toBe(true));

            const filtered = applyKidsMode([safeItem, horrorItem, thrillerItem, crimeItem, hentaiItem, goreItem, ...semanticAdultItems]);
            expect(filtered).toEqual([safeItem]);
        });

        it('hero catalogs strictly filter out non-kid items when kidsMode is active', async () => {
            // Profile with kidsMode enabled
            TasteProfile.findOne.mockResolvedValue({
                owner: 'user_1',
                context: 'kids_profile',
                compiledVectors: { V_final: { 'g:16': 10 } },
                settings: { kidsMode: true },
                lastUpdated: new Date()
            });

            // Mock DuckDB pool with mixed items
            getDuckDbCatalogFromPreset.mockResolvedValue([
                { id: 'tmdb:501', _tmdbId: 501, title: 'Safe Kids Movie', genre_ids: [16, 10751], vote_count: 2000 },
                { id: 'tmdb:502', _tmdbId: 502, title: 'Horror Slasher', genre_ids: [27], vote_count: 2500 }
            ]);

            getDuckDbMetaDetails.mockImplementation((id) => {
                if (String(id) === '501') {
                    return Promise.resolve({
                        rawTMDB: {
                            id: 501,
                            title: 'Safe Kids Movie',
                            genre_ids: [16, 10751],
                            release_date: '2021-01-01',
                            vote_count: 2000
                        }
                    });
                }
                if (String(id) === '502') {
                    return Promise.resolve({
                        rawTMDB: {
                            id: 502,
                            title: 'Horror Slasher',
                            genre_ids: [27],
                            release_date: '2020-01-01',
                            vote_count: 2500
                        }
                    });
                }
                return Promise.resolve(null);
            });

            const results = await getHybridCatalog(
                'yaca_true_blend_movies',
                0,
                null,
                'tmdb_key',
                'user_1',
                'kids_profile',
                createKidsUserConfig()
            );

            // La cache usa il kidsMode del profilo YACA e la configVersion.
            expect(hybridRecommendationsCache.getWithStatus).toHaveBeenCalledWith(
                'user_1_kids_profile_yaca_true_blend_movies_cvcfg-v1_kids'
            );

            // Item 502 (Horror) MUST NOT be returned in kidsMode
            const resultIds = results.map(r => r.id);
            expect(resultIds).toContain('tmdb:501');
            expect(resultIds).not.toContain('tmdb:502');
            expect(results.every(r => !r.genre_ids.includes(27))).toBe(true);
        });

        it('trakt_filtered hero filters out non-kid items even if returned by Trakt', async () => {
            TasteProfile.findOne.mockResolvedValue({
                owner: 'user_1',
                context: 'kids_profile',
                compiledVectors: { V_final: { 'g:12': 10 } },
                settings: { kidsMode: true },
                lastUpdated: new Date()
            });

            traktClient.get.mockResolvedValue({
                data: [
                    { movie: { ids: { tmdb: 601 } } },
                    { movie: { ids: { tmdb: 602 } } }
                ]
            });

            tmdb.getTmdbMovieDetails.mockImplementation((key, id) => {
                if (String(id) === '601') {
                    return Promise.resolve({
                        id: 601,
                        title: 'Family Adventure',
                        genre_ids: [12, 10751],
                        vote_count: 300
                    });
                }
                if (String(id) === '602') {
                    return Promise.resolve({
                        id: 602,
                        title: 'Dark Crime Mystery',
                        genre_ids: [80, 53],
                        vote_count: 400
                    });
                }
                return Promise.resolve(null);
            });

            getDuckDbMetaDetails.mockImplementation((id) => {
                if (String(id) === '601') {
                    return Promise.resolve({
                        rawTMDB: {
                            id: 601,
                            title: 'Family Adventure',
                            genre_ids: [12, 10751],
                            release_date: '2022-01-01'
                        }
                    });
                }
                if (String(id) === '602') {
                    return Promise.resolve({
                        rawTMDB: {
                            id: 602,
                            title: 'Dark Crime Mystery',
                            genre_ids: [80, 53],
                            release_date: '2022-01-01'
                        }
                    });
                }
                return Promise.resolve(null);
            });

            const results = await getHybridCatalog(
                'yaca_trakt_filtered_movies',
                0,
                'valid_token',
                'tmdb_key',
                'user_1',
                'kids_profile',
                createKidsUserConfig()
            );

            const resultIds = results.map(r => r.id);
            expect(resultIds).toContain('tmdb:601');
            expect(resultIds).not.toContain('tmdb:602');
        });

        it('usa esclusivamente kidsMode e configVersion del profilo YACA per la cache', () => {
            const kidsConfig = createKidsUserConfig('kids_profile', 'cfg-v2');
            const adultConfig = {
                ...kidsConfig,
                profiles: [{ id: 'kids_profile', settings: { kidsMode: false } }]
            };

            expect(getActiveKidsMode(kidsConfig, 'kids_profile')).toBe(true);
            expect(getActiveKidsMode(adultConfig, 'kids_profile')).toBe(false);

            const kidsKey = buildRecommendationCacheKey({
                userId: 'sim_user', context: 'kids_profile', catalogId: 'yaca_true_blend_movies',
                kidsMode: true, configVersion: 'cfg-v2'
            });
            const adultKey = buildRecommendationCacheKey({
                userId: 'sim_user', context: 'kids_profile', catalogId: 'yaca_true_blend_movies',
                kidsMode: false, configVersion: 'cfg-v2'
            });
            const nextVersionKey = buildRecommendationCacheKey({
                userId: 'sim_user', context: 'kids_profile', catalogId: 'yaca_true_blend_movies',
                kidsMode: true, configVersion: 'cfg-v3'
            });

            expect(kidsKey).toContain('_kids');
            expect(kidsKey).toContain('cfg-v2');
            expect(kidsKey).not.toBe(adultKey);
            expect(kidsKey).not.toBe(nextVersionKey);
            expect(buildRecommendationCacheKey({
                userId: 'sim_user', context: 'kids_profile', catalogId: 'yaca_true_blend_movies',
                kidsMode: false, configVersion: 0
            })).toContain('_cv0');
        });

        it('blocca Archer e i titoli adult-animation anche nell espansione seed', async () => {
            TasteProfile.findOne.mockResolvedValue({
                owner: 'user_1',
                context: 'kids_profile',
                compiledVectors: { V_final: { 'g:16': 10 } },
                lastUpdated: new Date()
            });
            AddonConfig.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    uuid: 'uuid_1',
                    profiles: [{ id: 'kids_profile', settings: { kidsMode: true, manualDNA: [], suggestedDNA: [] } }]
                })
            });

            getDuckDbCatalogFromPreset.mockResolvedValue([
                { id: 'tmdb:999', _tmdbId: 999, genre_ids: [16, 10762], keywords: [] }
            ]);
            getDuckDbCatalogFromFilters.mockResolvedValue([
                { id: 'tmdb:501', _tmdbId: 501, name: 'Safe', genre_ids: [16, 10762], keywords: [{ id: 3095 }] },
                { id: 'tmdb:10283', _tmdbId: 10283, name: 'Archer', genre_ids: [16, 35], keywords: [{ id: 14964 }, { id: 161919 }] },
                { id: 'tmdb:456', _tmdbId: 456, name: 'The Simpsons', genre_ids: [16, 35], keywords: [{ id: 161919 }, { id: 11192 }] },
                { id: 'tmdb:2122', _tmdbId: 2122, name: 'King of the Hill', genre_ids: [16, 35], keywords: [{ id: 161919 }] },
                { id: 'tmdb:84503', _tmdbId: 84503, name: 'Close Enough', genre_ids: [16, 35], keywords: [{ id: 161919 }, { id: 11192 }] },
                { id: 'tmdb:1434', _tmdbId: 1434, name: 'Family Guy', genre_ids: [16, 35], keywords: [{ id: 161919 }, { id: 11192 }] },
                { id: 'tmdb:5921', _tmdbId: 5921, name: 'The Life & Times of Tim', genre_ids: [16, 35], keywords: [{ id: 161919 }, { id: 9964 }, { id: 204950 }, { id: 220192 }] }
            ]);
            tmdb.getTmdbMovieDetails.mockResolvedValue({
                id: 501,
                name: 'Safe',
                genre_ids: [16, 10762],
                keywords: { results: [{ id: 3095 }] },
                vote_average: 8,
                vote_count: 1000
            });

            const result = await buildHybridCatalog(
                'user_1', 'kids_profile', null, 'tmdb_key', 'series', true
            );

            expect(result.map(item => item.id)).toEqual(['tmdb:501']);
        });

        it('applica i blocchi kids ai preset DuckDB e ai fallback', async () => {
            const filterPreset = buildPresetFromFilters(
                { with_genres: 28, without_keywords: '999' },
                'movie',
                { kidsMode: true }
            );
            expect(filterPreset.where.join(' ')).toContain('"id":999');
            expect(filterPreset.where.join(' ')).toContain('"id":14964');
            expect(filterPreset.where.join(' ')).toContain('"id":161919');

            const nativePreset = applyKidsModeToPreset(
                { type: 'movie', where: [], orderBy: 'popularity' },
                { kidsMode: true }
            );
            const nativeWhere = nativePreset.where.join(' ');
            expect(nativeWhere).toContain('"id":27');
            expect(nativeWhere).toContain('"id":161919');
            expect(nativeWhere).toContain('"id":220192');

            getDuckDbCatalogFromFilters.mockResolvedValue([
                { id: 'tmdb:601', name: 'Safe', genre_ids: [12], keywords: [{ id: 100 }] },
                { id: 'tmdb:10283', name: 'Archer', genre_ids: [16, 35], keywords: [{ id: 14964 }] }
            ]);
            const presetResult = await buildDirectPresetCatalog('preset_action_blockbusters', 'user_1', 'kids_profile', 'tmdb_key', 'movie', true);
            expect(getDuckDbCatalogFromFilters.mock.calls[0][0].without_keywords).toContain('161919');
            expect(getDuckDbCatalogFromFilters.mock.calls[0][0].without_keywords).toContain('220192');
            expect(presetResult.map(item => item.id)).toEqual(['601']);

            getDuckDbCatalogFromFilters.mockClear();
            const fallback = await fetchPopularFallbackIds('tmdb_key', 'series', 60, true);
            expect(getDuckDbCatalogFromFilters.mock.calls[0][0].without_keywords).toContain('14964');
            expect(getDuckDbCatalogFromFilters.mock.calls[0][0].without_keywords).toContain('161919');
            expect(fallback).toEqual(['601']);
        });
    });
});
