const { getHybridCatalog } = require('../src/engines/hybridRecommendations');
const TasteProfile = require('../src/models/TasteProfile');
const tmdb = require('../src/clients/tmdb');
const { traktClient, smartTraktRefresh } = require('../src/clients/trakt');
const { getDuckDbCatalogFromFilters, getDuckDbCatalogFromPreset, getDuckDbMetaDetails } = require('../src/catalog/providers/DuckDbProvider');
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

            expect(isItemInappropriateForKids(safeItem)).toBe(false);
            expect(isItemInappropriateForKids(horrorItem)).toBe(true);
            expect(isItemInappropriateForKids(thrillerItem)).toBe(true);
            expect(isItemInappropriateForKids(crimeItem)).toBe(true);
            expect(isItemInappropriateForKids(hentaiItem)).toBe(true);
            expect(isItemInappropriateForKids(goreItem)).toBe(true);

            const filtered = applyKidsMode([safeItem, horrorItem, thrillerItem, crimeItem, hentaiItem, goreItem]);
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
                'kids_profile'
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
                'kids_profile'
            );

            const resultIds = results.map(r => r.id);
            expect(resultIds).toContain('tmdb:601');
            expect(resultIds).not.toContain('tmdb:602');
        });
    });
});
