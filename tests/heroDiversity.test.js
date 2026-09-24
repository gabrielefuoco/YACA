const mockCacheStore = new Map();

jest.mock('../src/cache/cacheInstances', () => ({
    hybridRecommendationsCache: {
        getWithStatus: jest.fn(async key => {
            const value = mockCacheStore.get(key);
            return value === undefined
                ? { value: null, status: 'miss' }
                : { value, status: 'fresh' };
        }),
        set: jest.fn(async (key, value) => mockCacheStore.set(key, value)),
        delete: jest.fn(async key => mockCacheStore.delete(key)),
        clear: jest.fn(async () => mockCacheStore.clear())
    }
}));

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true })
}));
jest.mock('../src/models/RecommendationImpression', () => ({
    bulkWrite: jest.fn().mockResolvedValue(null)
}));
jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn().mockResolvedValue(null)
}));
jest.mock('../src/data/presets', () => ({ getPresets: jest.fn(() => []) }));
jest.mock('../src/clients/trakt', () => ({
    traktClient: { get: jest.fn() },
    smartTraktRefresh: jest.fn()
}));
jest.mock('../src/clients/tmdb', () => ({
    getTmdbMovieDetails: jest.fn().mockResolvedValue(null),
    createTmdbClient: jest.fn(() => ({ get: jest.fn() })),
    prioritizeLocalizedImages: jest.fn(items => items || [])
}));
jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbMetaDetails: jest.fn(),
    getDuckDbCatalogFromFilters: jest.fn(),
    getDuckDbCatalogFromPreset: jest.fn()
}));
jest.mock('../src/utils/rateLimiter', () => ({
    rateLimitedMap: jest.fn(async (items, mapper) => Promise.all(items.map(mapper)))
}));

jest.mock('../src/engines/hybrid/dataFetchers', () => ({
    fetchProfileContext: jest.fn().mockResolvedValue({
        profile: { compiledVectors: { V_final: {} } },
        user: { userId: 'sim_user', apiKeys: {} },
        globalProfile: null
    }),
    fetchRecentHistory: jest.fn().mockResolvedValue([]),
    fetchRecentRatings: jest.fn().mockResolvedValue([]),
    fetchTraktRecommendationsRaw: jest.fn().mockResolvedValue([]),
    fetchTraktRecommendationsRawDetailed: jest.fn(),
    fetchTmdbSimilarCounts: jest.fn().mockResolvedValue(new Map()),
    fetchPopularFallbackIds: jest.fn(),
    fetchTopRatedPeriodFallbackIds: jest.fn(),
    fetchUndiscoveredFallbackIds: jest.fn(),
    fetchHiddenGemsFallbackIds: jest.fn()
}));

jest.mock('../src/engines/hybrid/catalogStrategies', () => ({
    buildDirectPresetCatalog: jest.fn().mockResolvedValue([]),
    buildTopGenresMixCatalog: jest.fn(),
    buildHybridCatalog: jest.fn(),
    buildHiddenGemsCatalog: jest.fn(),
    buildTraktFilteredCatalog: jest.fn(),
    buildTraktFilteredCatalogWithMeta: jest.fn()
}));

const TasteProfile = require('../src/models/TasteProfile');
const { getDuckDbMetaDetails } = require('../src/catalog/providers/DuckDbProvider');
const dataFetchers = require('../src/engines/hybrid/dataFetchers');
const strategies = require('../src/engines/hybrid/catalogStrategies');
const { hybridRecommendationsCache } = require('../src/cache/cacheInstances');
const { normalizeAnimeMarker } = require('../src/utils/animeIdentity');
const {
    getHybridCatalog,
    buildSharedHeroCatalogs,
    getSharedHeroCatalogs,
    buildSharedHeroCacheKey
} = require('../src/engines/hybridRecommendations');

const movieHeroIds = [
    'yaca_true_blend_movies',
    'yaca_seed_network_movies',
    'yaca_hidden_gems_movies',
    'yaca_trakt_filtered_movies'
];

function pool(start, end) {
    return Array.from({ length: end - start + 1 }, (_, index) => ({
        id: String(start + index),
        matchScore: 80
    }));
}

function resultIds(results) {
    return results.map(item => item.id.replace(/^tmdb:/, ''));
}

function userConfig(version = 'cfg-v1', kidsMode = false, profileId = 'sim_profile') {
    return {
        userId: 'sim_user',
        activeProfileId: profileId,
        configVersion: version,
        apiKeys: { tmdb: 'tmdb-key' },
        profiles: [{
            id: profileId,
            settings: { kidsMode, typeSelectors: {} }
        }]
    };
}

function pairwiseOverlap(idsByCatalog) {
    const overlaps = [];
    for (let i = 0; i < idsByCatalog.length; i++) {
        for (let j = i + 1; j < idsByCatalog.length; j++) {
            const right = new Set(idsByCatalog[j]);
            overlaps.push(idsByCatalog[i].filter(id => right.has(id)));
        }
    }
    return overlaps;
}

describe('Ticket 21: shared hero diversity', () => {
    beforeEach(() => {
        mockCacheStore.clear();
        jest.clearAllMocks();

        TasteProfile.findOne.mockResolvedValue({
            owner: 'sim_user',
            context: 'sim_profile',
            lastUpdated: new Date()
        });
        getDuckDbMetaDetails.mockImplementation(async id => ({
            rawTMDB: {
                id: Number(id),
                title: `Movie ${id}`,
                overview: 'Fixture',
                release_date: '2025-01-01',
                vote_average: 7.5,
                vote_count: 500,
                genre_ids: [18]
            }
        }));

        for (const fetcher of [
            dataFetchers.fetchPopularFallbackIds,
            dataFetchers.fetchTopRatedPeriodFallbackIds,
            dataFetchers.fetchUndiscoveredFallbackIds,
            dataFetchers.fetchHiddenGemsFallbackIds
        ]) {
            fetcher.mockReset().mockResolvedValue([]);
        }
        dataFetchers.fetchProfileContext.mockReset().mockResolvedValue({
            profile: { compiledVectors: { V_final: {} } },
            user: { userId: 'sim_user', apiKeys: {} },
            globalProfile: null
        });
        dataFetchers.fetchTraktRecommendationsRawDetailed.mockReset().mockResolvedValue({
            items: [], available: false, reason: 'credentials'
        });

        for (const builder of [
            strategies.buildTopGenresMixCatalog,
            strategies.buildHybridCatalog,
            strategies.buildHiddenGemsCatalog,
            strategies.buildTraktFilteredCatalog,
            strategies.buildTraktFilteredCatalogWithMeta
        ]) {
            builder.mockReset().mockResolvedValue([]);
        }
    });

    it('assegna una sola volta i pool sovrapposti per priorità e resta stabile tra skip', async () => {
        const trueBlend = pool(1, 60);
        const seed = [...pool(1, 20), ...pool(101, 140)];
        const hidden = [...pool(10, 30), ...pool(201, 240)];
        const trakt = [...pool(1, 10), ...pool(301, 360)];

        strategies.buildTopGenresMixCatalog.mockResolvedValue(trueBlend);
        strategies.buildHybridCatalog.mockResolvedValue(seed);
        strategies.buildHiddenGemsCatalog.mockResolvedValue(hidden);
        strategies.buildTraktFilteredCatalogWithMeta.mockResolvedValue({
            ids: trakt,
            traktAvailable: true,
            fallbackUsed: false
        });
        dataFetchers.fetchTraktRecommendationsRawDetailed.mockResolvedValue({
            items: [{ movie: { ids: { tmdb: 301 } } }],
            available: true,
            reason: 'ok'
        });

        // Richieste simultanee e in ordine inverso: la priorità non dipende dall'arrivo.
        const firstPageEntries = await Promise.all([...movieHeroIds].reverse().map(async catalogId => [
            catalogId,
            await getHybridCatalog(catalogId, 0, 'trakt-token', 'tmdb-key', 'sim_user', 'sim_profile', userConfig())
        ]));
        const secondPageEntries = await Promise.all(movieHeroIds.map(async catalogId => [
            catalogId,
            await getHybridCatalog(catalogId, 20, 'trakt-token', 'tmdb-key', 'sim_user', 'sim_profile', userConfig())
        ]));
        const thirdPageEntries = await Promise.all(movieHeroIds.map(async catalogId => [
            catalogId,
            await getHybridCatalog(catalogId, 40, 'trakt-token', 'tmdb-key', 'sim_user', 'sim_profile', userConfig())
        ]));
        const firstPages = new Map(firstPageEntries);
        const secondPages = new Map(secondPageEntries);
        const thirdPages = new Map(thirdPageEntries);

        const combined = Object.fromEntries(movieHeroIds.map(catalogId => [
            catalogId,
            [
                ...resultIds(firstPages.get(catalogId)),
                ...resultIds(secondPages.get(catalogId)),
                ...resultIds(thirdPages.get(catalogId))
            ]
        ]));
        expect(combined.yaca_true_blend_movies).toEqual(pool(1, 60).map(item => item.id));
        expect(combined.yaca_seed_network_movies).toEqual(pool(101, 140).map(item => item.id));
        expect(combined.yaca_hidden_gems_movies).toEqual(pool(201, 240).map(item => item.id));
        expect(combined.yaca_trakt_filtered_movies).toEqual(pool(301, 360).map(item => item.id));
        expect(pairwiseOverlap(Object.values(combined))).toEqual([[], [], [], [], [], []]);

        expect(strategies.buildTopGenresMixCatalog).toHaveBeenCalledTimes(1);
        expect(strategies.buildHybridCatalog).toHaveBeenCalledTimes(1);
        expect(strategies.buildHiddenGemsCatalog).toHaveBeenCalledTimes(1);
        expect(strategies.buildTraktFilteredCatalogWithMeta).toHaveBeenCalledTimes(1);
        expect(dataFetchers.fetchTraktRecommendationsRawDetailed).toHaveBeenCalledTimes(1);
        expect(mockCacheStore.size).toBe(1);
    });

    it('preserva le prove anime nel payload hero per il boundary normalizzato', async () => {
        strategies.buildTopGenresMixCatalog.mockResolvedValue([
            { id: '803796', matchScore: 40 }
        ]);
        getDuckDbMetaDetails.mockResolvedValue({
            _isAnime: true,
            rawTMDB: {
                id: 803796,
                title: 'KPop Demon Hunters',
                overview: 'Fixture',
                release_date: '2025-06-20',
                vote_average: 8,
                genre_ids: [14, 10402, 35, 16],
                original_language: 'en',
                keywords: { results: [{ id: 999999, name: 'animesque' }] }
            }
        });

        const results = await getHybridCatalog(
            'yaca_true_blend_movies',
            0,
            null,
            'tmdb-key',
            'sim_user',
            'sim_profile',
            userConfig()
        );

        expect(results).toHaveLength(1);
        expect(results[0]).toEqual(expect.objectContaining({
            id: 'tmdb:803796',
            name: 'KPop Demon Hunters',
            original_language: 'en',
            keywords: [{ id: 999999, name: 'animesque' }]
        }));
        expect(normalizeAnimeMarker(results[0])).toBe(true);
    });

    it('deduplica i quattro fallback freddi anche quando i builder falliscono', async () => {
        for (const builder of [
            strategies.buildTopGenresMixCatalog,
            strategies.buildHybridCatalog,
            strategies.buildHiddenGemsCatalog,
            strategies.buildTraktFilteredCatalogWithMeta
        ]) {
            builder.mockRejectedValue(new Error('builder freddo non disponibile'));
        }
        dataFetchers.fetchPopularFallbackIds.mockResolvedValue(pool(1, 30).map(item => item.id));
        dataFetchers.fetchTopRatedPeriodFallbackIds.mockResolvedValue(pool(31, 60).map(item => item.id));
        dataFetchers.fetchHiddenGemsFallbackIds.mockResolvedValue(pool(61, 90).map(item => item.id));
        dataFetchers.fetchUndiscoveredFallbackIds.mockResolvedValue(pool(91, 120).map(item => item.id));

        const group = await buildSharedHeroCatalogs({
            userId: 'sim_user',
            context: 'sim_profile',
            mediaType: 'movie',
            traktToken: null,
            tmdbApiKey: 'tmdb-key',
            kidsMode: false,
            userConfig: userConfig()
        });
        const ids = movieHeroIds.map(catalogId => group.catalogs[catalogId].map(item => String(item)));

        expect(ids).toEqual([
            pool(1, 30).map(item => item.id),
            pool(31, 60).map(item => item.id),
            pool(61, 90).map(item => item.id),
            pool(91, 120).map(item => item.id)
        ]);
        expect(pairwiseOverlap(ids)).toEqual([[], [], [], [], [], []]);
        expect(dataFetchers.fetchPopularFallbackIds).toHaveBeenCalledTimes(1);
        expect(dataFetchers.fetchTopRatedPeriodFallbackIds).toHaveBeenCalledTimes(1);
        expect(dataFetchers.fetchHiddenGemsFallbackIds).toHaveBeenCalledTimes(1);
        expect(dataFetchers.fetchUndiscoveredFallbackIds).toHaveBeenCalledTimes(1);
        expect(group.trakt).toEqual({
            available: false,
            fallbackUsed: true,
            hiddenForInsufficientFallback: false
        });
    });

    it('scarta una cache schema 3 con overlap invece di servirla', async () => {
        const key = buildSharedHeroCacheKey({
            userId: 'sim_user',
            context: 'sim_profile',
            mediaType: 'movie',
            kidsMode: false,
            configVersion: 'cfg-v1'
        });
        mockCacheStore.set(key, {
            schemaVersion: 3,
            mediaType: 'movie',
            catalogs: {
                yaca_true_blend_movies: [{ id: '1' }],
                yaca_seed_network_movies: [{ id: '1' }],
                yaca_hidden_gems_movies: [{ id: '2' }],
                yaca_trakt_filtered_movies: [{ id: '3' }]
            }
        });
        strategies.buildTopGenresMixCatalog.mockResolvedValue(pool(1, 40));
        strategies.buildHybridCatalog.mockResolvedValue(pool(101, 140));
        strategies.buildHiddenGemsCatalog.mockResolvedValue(pool(201, 240));
        strategies.buildTraktFilteredCatalogWithMeta.mockResolvedValue({
            ids: pool(301, 340),
            traktAvailable: false,
            fallbackUsed: true
        });

        const group = await getSharedHeroCatalogs({
            userId: 'sim_user',
            context: 'sim_profile',
            mediaType: 'movie',
            traktToken: null,
            tmdbApiKey: 'tmdb-key',
            kidsMode: false,
            userConfig: userConfig()
        }, key);
        const ids = movieHeroIds.map(catalogId => group.catalogs[catalogId].map(item => item.id));

        expect(group.schemaVersion).toBe(4);
        expect(pairwiseOverlap(ids)).toEqual([[], [], [], [], [], []]);
        expect(ids).toEqual([
            pool(1, 40).map(item => item.id),
            pool(101, 140).map(item => item.id),
            pool(201, 240).map(item => item.id),
            pool(301, 340).map(item => item.id)
        ]);
        expect(strategies.buildTopGenresMixCatalog).toHaveBeenCalledTimes(1);
        expect(strategies.buildHybridCatalog).toHaveBeenCalledTimes(1);
        expect(strategies.buildHiddenGemsCatalog).toHaveBeenCalledTimes(1);
        expect(strategies.buildTraktFilteredCatalogWithMeta).toHaveBeenCalledTimes(1);
    });

    it('mantiene isolati due profili con lo stesso DNA e cache key distinta', async () => {
        const profileA = 'sim_profile_dna_a';
        const profileB = 'sim_profile_dna_b';
        const poolsByProfile = {
            [profileA]: [pool(1, 40), pool(101, 140), pool(201, 240), pool(301, 340)],
            [profileB]: [pool(401, 440), pool(501, 540), pool(601, 640), pool(701, 740)]
        };
        for (const [index, builder] of [
            strategies.buildTopGenresMixCatalog,
            strategies.buildHybridCatalog,
            strategies.buildHiddenGemsCatalog
        ].entries()) {
            builder.mockImplementation(async (_userId, context) => poolsByProfile[context][index]);
        }
        strategies.buildTraktFilteredCatalogWithMeta.mockImplementation(async (_userId, context) => ({
            ids: poolsByProfile[context][3],
            traktAvailable: false,
            fallbackUsed: true
        }));

        async function fetchProfile(profileId) {
            const config = userConfig('cfg-shared-dna', false, profileId);
            const first = await Promise.all(movieHeroIds.map(async catalogId => [
                catalogId,
                await getHybridCatalog(catalogId, 0, null, 'tmdb-key', 'sim_user', profileId, config)
            ]));
            const second = await Promise.all(movieHeroIds.map(async catalogId => [
                catalogId,
                await getHybridCatalog(catalogId, 20, null, 'tmdb-key', 'sim_user', profileId, config)
            ]));
            return { first: new Map(first), second: new Map(second) };
        }

        const [profileAResult, profileBResult] = await Promise.all([
            fetchProfile(profileA),
            fetchProfile(profileB)
        ]);
        for (const result of [profileAResult, profileBResult]) {
            const combined = Object.fromEntries(movieHeroIds.map(catalogId => [
                catalogId,
                [
                    ...result.first.get(catalogId).map(item => item.id),
                    ...result.second.get(catalogId).map(item => item.id)
                ]
            ]));
            expect(pairwiseOverlap(Object.values(combined))).toEqual([[], [], [], [], [], []]);
        }

        expect(mockCacheStore.size).toBe(2);
        expect(strategies.buildTopGenresMixCatalog).toHaveBeenCalledTimes(2);
        expect(strategies.buildHybridCatalog).toHaveBeenCalledTimes(2);
        expect(strategies.buildHiddenGemsCatalog).toHaveBeenCalledTimes(2);
        expect(strategies.buildTraktFilteredCatalogWithMeta).toHaveBeenCalledTimes(2);
        expect(profileAResult.first.get('yaca_true_blend_movies')[0].id).not.toBe(
            profileBResult.first.get('yaca_true_blend_movies')[0].id
        );
    });

    it('nasconde il catalogo Trakt quando il fallback deduplicato resta sotto 10', async () => {
        strategies.buildTopGenresMixCatalog.mockResolvedValue(pool(1, 20));
        strategies.buildTraktFilteredCatalogWithMeta.mockResolvedValue({
            ids: pool(1, 9),
            traktAvailable: false,
            fallbackUsed: true
        });

        const results = await getHybridCatalog(
            'yaca_trakt_filtered_movies',
            0,
            null,
            'tmdb-key',
            'sim_user',
            'sim_profile',
            userConfig()
        );

        expect(results).toEqual([]);
        const cached = [...mockCacheStore.values()][0];
        expect(cached.catalogs.yaca_trakt_filtered_movies).toEqual([]);
        expect(cached.trakt.hiddenForInsufficientFallback).toBe(true);
    });

    it('separa la cache per tipo, kidsMode e configVersion', () => {
        const base = { userId: 'sim_user', context: 'sim_profile', mediaType: 'movie', kidsMode: false };
        const key = buildSharedHeroCacheKey({ ...base, configVersion: 'cfg-v1' });

        expect(buildSharedHeroCacheKey({ ...base, configVersion: 'cfg-v2' })).not.toBe(key);
        expect(buildSharedHeroCacheKey({ ...base, kidsMode: true, configVersion: 'cfg-v1' })).not.toBe(key);
        expect(buildSharedHeroCacheKey({ ...base, mediaType: 'series', configVersion: 'cfg-v1' })).not.toBe(key);
        expect(hybridRecommendationsCache.getWithStatus).not.toHaveBeenCalled();
    });
});
