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

// WatchHistory/UserLibraryItem: senza mock il buffer di mongoose fa attendere ~10s
// per suite e svuota i pool (i seed reali non trovano nulla).
jest.mock('../src/models/WatchHistory', () => {
    const emptyQuery = () => {
        const q = {};
        q.sort = () => q;
        q.limit = () => q;
        q.select = () => q;
        q.lean = () => Promise.resolve([]);
        q.then = (resolve, reject) => Promise.resolve([]).then(resolve, reject);
        return q;
    };
    return { find: jest.fn(emptyQuery), findOne: jest.fn(emptyQuery), countDocuments: jest.fn().mockResolvedValue(0) };
});

jest.mock('../src/db/models/UserLibraryItem', () => ({
    find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
    countDocuments: jest.fn().mockResolvedValue(0)
}));

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/clients/trakt', () => ({
    traktClient: { get: jest.fn() },
    smartTraktRefresh: jest.fn()
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMovieDetails: jest.fn(),
    createTmdbClient: jest.fn(),
    prioritizeLocalizedImages: jest.fn(items => items || [])
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return {
        ...actual,
        getDuckDbMetaDetails: jest.fn(),
        getDuckDbCatalogFromFilters: jest.fn(),
        getDuckDbCatalogFromPreset: jest.fn()
    };
});

jest.mock('../src/engines/graph/HierarchicalGraph', () => {
    const actual = jest.requireActual('../src/engines/graph/HierarchicalGraph');
    return {
        ...actual,
        loadData: jest.fn().mockResolvedValue(true),
        getTopKeywordsForNode: jest.fn().mockReturnValue([]),
        getTopKeywordsForNodes: jest.fn().mockReturnValue([]),
        // ProfileScorer.calculateBaseItemMatch lo usa: senza grafo caricato il contributo è vuoto.
        vectorizeKeywords: jest.fn().mockReturnValue({})
    };
});

const TasteProfile = require('../src/models/TasteProfile');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const tmdb = require('../src/clients/tmdb');
const { traktClient } = require('../src/clients/trakt');
const {
    getDuckDbMetaDetails,
    getDuckDbCatalogFromFilters,
    getDuckDbCatalogFromPreset
} = require('../src/catalog/providers/DuckDbProvider');
const { normalizeAnimeMarker } = require('../src/utils/animeIdentity');
const {
    buildTopGenresMixCatalog,
    buildHybridCatalog,
    buildHiddenGemsCatalog,
    buildTraktFilteredCatalogWithMeta
} = require('../src/engines/hybrid/catalogStrategies');
const { getHybridCatalog } = require('../src/engines/hybridRecommendations');
const { getEngineHybridCatalog } = require('../src/catalog/providers/HybridProvider');

describe('Hero Movie Catalogs - typeSelectors (anime: only & exclude)', () => {
    const mockItems = {
        '101': {
            id: 101,
            title: 'Demon Slayer - Mugen Train',
            name: 'Demon Slayer - Mugen Train',
            original_language: 'ja',
            genre_ids: [16, 28],
            genres: [{ id: 16, name: 'Animation' }, { id: 28, name: 'Action' }],
            vote_count: 5000,
            vote_average: 8.2,
            popularity: 150,
            keywords: [{ id: 210024, name: 'anime' }],
            release_date: '2020-10-16'
        },
        '102': {
            id: 102,
            title: 'Your Name.',
            name: 'Your Name.',
            original_language: 'ja',
            genre_ids: [16, 10749],
            genres: [{ id: 16, name: 'Animation' }, { id: 10749, name: 'Romance' }],
            vote_count: 8000,
            vote_average: 8.5,
            popularity: 120,
            keywords: [{ id: 210024, name: 'anime' }],
            release_date: '2016-08-26'
        },
        '103': {
            id: 103,
            title: 'Spirited Away',
            name: 'Spirited Away',
            original_language: 'ja',
            genre_ids: [16, 14],
            genres: [{ id: 16, name: 'Animation' }, { id: 14, name: 'Fantasy' }],
            vote_count: 9000,
            vote_average: 8.6,
            popularity: 130,
            keywords: [{ id: 210024, name: 'anime' }],
            release_date: '2001-07-20'
        },
        '201': {
            id: 201,
            title: 'Interstellar',
            name: 'Interstellar',
            original_language: 'en',
            genre_ids: [12, 18, 878],
            genres: [{ id: 12, name: 'Adventure' }, { id: 18, name: 'Drama' }, { id: 878, name: 'Science Fiction' }],
            vote_count: 20000,
            vote_average: 8.5,
            popularity: 180,
            keywords: [{ id: 83, name: 'black hole' }],
            release_date: '2014-11-05'
        },
        '202': {
            id: 202,
            title: 'Harry Potter e la pietra filosofale',
            name: 'Harry Potter e la pietra filosofale',
            original_language: 'en',
            genre_ids: [12, 14],
            genres: [{ id: 12, name: 'Adventure' }, { id: 14, name: 'Fantasy' }],
            vote_count: 15000,
            vote_average: 7.9,
            popularity: 110,
            keywords: [{ id: 2343, name: 'magic' }],
            release_date: '2001-11-16'
        },
        '203': {
            id: 203,
            title: 'Il Signore degli Anelli - La Compagnia dell Anello',
            name: 'Il Signore degli Anelli - La Compagnia dell Anello',
            original_language: 'en',
            genre_ids: [12, 14, 28],
            genres: [{ id: 12, name: 'Adventure' }, { id: 14, name: 'Fantasy' }, { id: 28, name: 'Action' }],
            vote_count: 22000,
            vote_average: 8.4,
            popularity: 190,
            keywords: [{ id: 6092, name: 'ring' }],
            release_date: '2001-12-19'
        }
    };

    // Il gate HERO_MIN_FALLBACK_ITEMS = 10 nasconde il catalogo trakt quando il pool
    // fallback è più piccolo: con 6 sole fixture i test E2E non potevano verificare nulla.
    const mkAnimeFixture = (id) => ({
        id,
        title: `Anime Fixture ${id}`,
        name: `Anime Fixture ${id}`,
        original_language: 'ja',
        genre_ids: [16, 28],
        genres: [{ id: 16, name: 'Animation' }, { id: 28, name: 'Action' }],
        vote_count: 3000 + id,
        vote_average: 8.0,
        popularity: 100 + (id % 40),
        keywords: [{ id: 210024, name: 'anime' }],
        release_date: '2020-01-01'
    });

    const mkLiveActionFixture = (id) => ({
        id,
        title: `Live Action Fixture ${id}`,
        name: `Live Action Fixture ${id}`,
        original_language: 'en',
        genre_ids: [12, 18],
        genres: [{ id: 12, name: 'Adventure' }, { id: 18, name: 'Drama' }],
        vote_count: 4000 + id,
        vote_average: 7.5,
        popularity: 90 + (id % 40),
        keywords: [{ id: 1234, name: 'journey' }],
        release_date: '2018-01-01'
    });

    for (let i = 0; i < 9; i++) {
        mockItems[String(110 + i)] = mkAnimeFixture(110 + i);
        mockItems[String(210 + i)] = mkLiveActionFixture(210 + i);
    }

    // Fixture esclusive del ramo Trakt (id >= 500): il pool "community" (mock DuckDB)
    // non le restituisce, altrimenti la dedup tra hero (true_blend prima) le ruba
    // e il hero trakt resta a 0.
    mockItems['501'] = mkAnimeFixture(501);
    mockItems['502'] = mkAnimeFixture(502);
    mockItems['601'] = mkLiveActionFixture(601);
    mockItems['602'] = mkLiveActionFixture(602);

    // La forma store dei fixture "community" (id < 500)
    const communityFixtures = () => Object.values(mockItems).filter(it => it.id < 500);

    // Il provider DuckDB restituisce righe in forma "store" (id stringa 'tmdb:<n>',
    // _tmdbId numerico, campi piatti + rawTMDB), NON oggetti TMDB grezzi: il codice
    // usa item._tmdbId / item.id.split(':'). Le fixture devono rispecchiarla.
    const toStoreRow = (it) => ({
        id: `tmdb:${it.id}`,
        _tmdbId: it.id,
        type: 'movie',
        name: it.title,
        vote_average: it.vote_average,
        vote_count: it.vote_count,
        popularity: it.popularity,
        genre_ids: it.genre_ids,
        original_language: it.original_language,
        keywords: it.keywords,
        rawTMDB: it,
        _isAnime: it.genre_ids.includes(16)
            && (it.original_language === 'ja' || /anime/i.test(JSON.stringify(it.keywords || [])))
    });

    const animeOnlyUserConfig = {
        userId: 'otaku_user',
        activeProfileId: '1c1da0af',
        configVersion: 'v1',
        apiKeys: { tmdb: 'tmdb_key', trakt: 'trakt_token' },
        profiles: [{
            id: '1c1da0af',
            settings: {
                kidsMode: false,
                typeSelectors: { film: false, serie: false, anime: 'only' }
            }
        }]
    };

    const animeExcludeUserConfig = {
        userId: 'liveaction_user',
        activeProfileId: 'no_anime_prof',
        configVersion: 'v1',
        apiKeys: { tmdb: 'tmdb_key', trakt: 'trakt_token' },
        profiles: [{
            id: 'no_anime_prof',
            settings: {
                kidsMode: false,
                typeSelectors: { film: false, serie: false, anime: 'exclude' }
            }
        }]
    };

    beforeEach(() => {
        mockCacheStore.clear();
        jest.clearAllMocks();
        // Senza questo, safeTraktFetchDetailed esce con reason='credentials' e il ramo Trakt non è mai disponibile.
        process.env.TRAKT_CLIENT_ID = 'test_trakt_client_id';

        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                userId: 'otaku_user',
                addonUuid: 'addon_uuid',
                apiKeys: { trakt: 'trakt_token' }
            })
        });

        AddonConfig.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                uuid: 'addon_uuid',
                userId: 'otaku_user',
                apiKeys: { trakt: 'trakt_token' },
                profiles: animeOnlyUserConfig.profiles
            })
        });

        TasteProfile.findOne.mockImplementation(({ context }) => Promise.resolve({
            owner: 'otaku_user',
            context,
            compiledVectors: {
                V_final: { 'g:16': 15, 'g:28': 10, 'g:12': 8, 'g:18': 5, 'k:210024': 8 }
            },
            settings: {},
            lastUpdated: new Date()
        }));

        tmdb.getTmdbMovieDetails.mockImplementation(async (key, id) => {
            return mockItems[String(id)] || null;
        });

        tmdb.createTmdbClient.mockReturnValue({
            get: jest.fn(async (endpoint) => {
                const match = endpoint.match(/\/movie\/(\d+)/);
                const id = match ? match[1] : null;
                return { data: mockItems[String(id)] || { id, title: 'Unknown' } };
            })
        });

        getDuckDbMetaDetails.mockImplementation(async (id) => {
            const item = mockItems[String(id)];
            return item ? toStoreRow(item) : null;
        });

        getDuckDbCatalogFromPreset.mockImplementation(async (preset) => {
            const whereStr = JSON.stringify(preset.where || []);
            const all = communityFixtures();
            if (whereStr.includes('NOT')) {
                return all.filter(it => it.original_language !== 'ja' && !it.genre_ids.includes(16)).map(toStoreRow);
            }
            if (whereStr.includes('16') && whereStr.includes('original_language')) {
                return all.filter(it => it.original_language === 'ja' || it.genre_ids.includes(16)).map(toStoreRow);
            }
            return all.map(toStoreRow);
        });

        getDuckDbCatalogFromFilters.mockImplementation(async (filters) => {
            const all = communityFixtures();
            if (filters.isAnime) {
                return all.filter(it => it.original_language === 'ja' || it.genre_ids.includes(16)).map(toStoreRow);
            }
            if (filters.notAnime) {
                return all.filter(it => it.original_language !== 'ja' && !it.genre_ids.includes(16)).map(toStoreRow);
            }
            return all.map(toStoreRow);
        });

        traktClient.get.mockResolvedValue({
            data: [
                { movie: { ids: { tmdb: 501 } } },
                { movie: { ids: { tmdb: 502 } } },
                { movie: { ids: { tmdb: 601 } } },
                { movie: { ids: { tmdb: 602 } } }
            ]
        });
    });

    describe('Hero catalog strategies direct filtering', () => {
        it('buildTraktFilteredCatalogWithMeta con anime: "only" include solo anime ed esclude live-action (Interstellar/Harry Potter)', async () => {
            const result = await buildTraktFilteredCatalogWithMeta(
                'otaku_user',
                '1c1da0af',
                'trakt_token',
                'tmdb_key',
                'movie',
                false,
                null,
                { anime: 'only' }
            );

            expect(result.ids.length).toBeGreaterThan(0);
            // Il builder restituisce due forme: stringhe nel percorso fallback, { id } in quello Trakt.
            const returnedIds = result.ids.map(i => (typeof i === 'string' ? i : i.id));
            expect(returnedIds).toContain('501');
            expect(returnedIds).toContain('502');
            expect(returnedIds).not.toContain('601'); // live-action Trakt
            expect(returnedIds).not.toContain('602');
            expect(returnedIds).not.toContain('201'); // Interstellar (community)
            expect(returnedIds).not.toContain('202'); // Harry Potter (community)
        });

        it('buildTraktFilteredCatalogWithMeta con anime: "exclude" include solo live-action ed esclude anime', async () => {
            const result = await buildTraktFilteredCatalogWithMeta(
                'liveaction_user',
                'no_anime_prof',
                'trakt_token',
                'tmdb_key',
                'movie',
                false,
                null,
                { anime: 'exclude' }
            );

            expect(result.ids.length).toBeGreaterThan(0);
            const returnedIds = result.ids.map(i => (typeof i === 'string' ? i : i.id));
            expect(returnedIds).toContain('601'); // live-action Trakt
            expect(returnedIds).toContain('602');
            expect(returnedIds).not.toContain('501');
            expect(returnedIds).not.toContain('502');
        });

        it('buildTopGenresMixCatalog (True Blend) con anime: "only" restituisce solo anime', async () => {
            const result = await buildTopGenresMixCatalog(
                'otaku_user',
                '1c1da0af',
                'tmdb_key',
                'movie',
                false,
                { anime: 'only' }
            );

            expect(result.length).toBeGreaterThan(0);
            const returnedIds = result.map(i => i.id);
            expect(returnedIds.every(id => {
                const fixture = mockItems[String(id)];
                return fixture && fixture.genre_ids.includes(16) && fixture.original_language === 'ja';
            })).toBe(true);
            expect(returnedIds).not.toContain('201');
            expect(returnedIds).not.toContain('202');
            expect(returnedIds).not.toContain('203');
        });

        it('buildTopGenresMixCatalog (True Blend) con anime: "exclude" restituisce solo non-anime', async () => {
            const result = await buildTopGenresMixCatalog(
                'liveaction_user',
                'no_anime_prof',
                'tmdb_key',
                'movie',
                false,
                { anime: 'exclude' }
            );

            expect(result.length).toBeGreaterThan(0);
            const returnedIds = result.map(i => i.id);
            expect(returnedIds.some(id => ['201', '202', '203'].includes(id))).toBe(true);
            expect(returnedIds).not.toContain('101');
            expect(returnedIds).not.toContain('102');
            expect(returnedIds).not.toContain('103');
        });
    });

    describe('End-to-End getHybridCatalog per hero movies', () => {
        it('yaca_trakt_filtered_movies per profilo anime: "only" NON restituisce alcun live-action', async () => {
            const results = await getHybridCatalog(
                'yaca_trakt_filtered_movies',
                0,
                'trakt_token',
                'tmdb_key',
                'otaku_user',
                '1c1da0af',
                animeOnlyUserConfig
            );

            expect(results.length).toBeGreaterThan(0);
            for (const item of results) {
                // Ogni item restituito DEVE essere anime (genere 16 e lingua ja)
                const isAnime = normalizeAnimeMarker(item);
                expect(isAnime).toBe(true);
                expect(item.genre_ids).toContain(16);
                expect(item.original_language).toBe('ja');
                // Nessun live-action presente
                expect(['tmdb:201', 'tmdb:202', 'tmdb:203']).not.toContain(item.id);
            }
        });

        it('yaca_true_blend_movies per profilo anime: "only" restituisce solo anime', async () => {
            const results = await getHybridCatalog(
                'yaca_true_blend_movies',
                0,
                'trakt_token',
                'tmdb_key',
                'otaku_user',
                '1c1da0af',
                animeOnlyUserConfig
            );

            expect(results.length).toBeGreaterThan(0);
            for (const item of results) {
                const isAnime = normalizeAnimeMarker(item);
                expect(isAnime).toBe(true);
                expect(item.genre_ids).toContain(16);
                expect(['tmdb:201', 'tmdb:202', 'tmdb:203']).not.toContain(item.id);
            }
        });

        it('yaca_trakt_filtered_movies per profilo anime: "exclude" esclude qualsiasi anime (nessun item ha genere 16 / lingua ja)', async () => {
            const results = await getHybridCatalog(
                'yaca_trakt_filtered_movies',
                0,
                'trakt_token',
                'tmdb_key',
                'liveaction_user',
                'no_anime_prof',
                animeExcludeUserConfig
            );

            expect(results.length).toBeGreaterThan(0);
            for (const item of results) {
                // Nessun item restituito deve essere anime
                const isAnime = normalizeAnimeMarker(item);
                expect(isAnime).toBe(false);
                expect(item.original_language).not.toBe('ja');
                expect(item.genre_ids).not.toContain(16);
                expect(['tmdb:101', 'tmdb:102', 'tmdb:103']).not.toContain(item.id);
            }
        });

        it('getEngineHybridCatalog tramite HybridProvider propaga activeProfileSettings e filtra correttamente', async () => {
            const results = await getEngineHybridCatalog(
                'yaca_trakt_filtered_movies',
                'movie',
                0,
                animeOnlyUserConfig,
                'tmdb_key',
                { typeSelectors: { anime: 'only' } }
            );

            expect(results.length).toBeGreaterThan(0);
            for (const item of results) {
                expect(normalizeAnimeMarker(item)).toBe(true);
                expect(item.genre_ids).toContain(16);
                expect(['tmdb:201', 'tmdb:202', 'tmdb:203']).not.toContain(item.id);
            }
        });
    });
});
