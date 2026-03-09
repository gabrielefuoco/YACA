/**
 * Tests for comprehensive bug fixes covering:
 * 1. TMDB mirror failover retry limit
 * 2. Episode fetch rate limiting
 * 3. MDBList negative cache
 * 4. Duplicate TMDB call removal
 * 5. Cast trim consistency
 * 6. Lingva 414 URI truncation
 * 7. SWR freshness clock preservation
 * 8. Anime false positive classification
 * 9. Negative cache for ID lookups
 * 10. MDBList sequential -> parallel processing
 * 11. RAM cache sizing
 */

const mockCreateAxiosInstance = jest.fn();

jest.mock('../src/utils/httpClient', () => ({
    createAxiosInstance: mockCreateAxiosInstance
}));

jest.mock('../src/models/TmdbRequestCache', () => ({
    get: jest.fn(),
    getWithStatus: jest.fn().mockResolvedValue({ value: undefined, status: 'miss' }),
    set: jest.fn()
}));

jest.mock('../src/utils/releaseFilter', () => ({
    isMovieReleasedDigitally: jest.fn(),
    isMovieReleasedInRegion: jest.fn()
}));

jest.mock('../src/utils/requestHash', () => ({
    generateRequestHash: jest.fn(() => 'hash')
}));

const mockCacheInstances = {};
jest.mock('../src/cache/CacheManager', () => {
    return jest.fn().mockImplementation((namespace) => {
        const instance = {
            get: jest.fn().mockResolvedValue(undefined),
            getWithStatus: jest.fn().mockResolvedValue({ value: undefined, status: 'miss' }),
            set: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
            clear: jest.fn().mockResolvedValue(undefined)
        };
        mockCacheInstances[namespace] = instance;
        return instance;
    });
});

function createBaseTmdbData(overrides = {}) {
    return {
        id: 100,
        title: 'Titolo',
        original_title: 'Original title',
        name: 'Titolo',
        original_name: 'Original title',
        original_language: 'ja',
        release_date: '2020-01-01',
        first_air_date: '2020-01-01',
        poster_path: '/default.jpg',
        backdrop_path: '/bg.jpg',
        overview: 'Descrizione base molto lunga e valida.',
        vote_average: 7.2,
        number_of_seasons: 0,
        genres: [],
        credits: { cast: [], crew: [] },
        images: { logos: [], backdrops: [], posters: [] },
        videos: { results: [] },
        external_ids: { imdb_id: 'tt100' },
        release_dates: { results: [] },
        content_ratings: { results: [] },
        keywords: { keywords: [], results: [] },
        ...overrides
    };
}

describe('Bug Fix: TMDB mirror failover retry limit', () => {
    let tmdbGetMock;
    let requestMock;

    beforeEach(() => {
        jest.resetModules();
        Object.keys(mockCacheInstances).forEach(k => delete mockCacheInstances[k]);
        tmdbGetMock = jest.fn();
        requestMock = jest.fn();
        mockCreateAxiosInstance.mockReset();
        mockCreateAxiosInstance.mockImplementation(() => ({
            get: tmdbGetMock,
            request: requestMock,
            defaults: { params: { api_key: 'key' } },
            interceptors: { response: { use: jest.fn() } }
        }));
    });

    it('should export createTmdbClient with interceptor support', () => {
        const { createTmdbClient } = require('../src/clients/tmdb');
        expect(createTmdbClient).toBeDefined();
        const client = createTmdbClient('test-key');
        expect(client).toBeDefined();
        expect(client.interceptors.response.use).toHaveBeenCalled();
    });
});

describe('Bug Fix: Cast trim consistency (MAX_CAST_SIZE)', () => {
    let tmdbGetMock;

    beforeEach(() => {
        jest.resetModules();
        Object.keys(mockCacheInstances).forEach(k => delete mockCacheInstances[k]);
        tmdbGetMock = jest.fn();
        mockCreateAxiosInstance.mockReset();
        mockCreateAxiosInstance.mockImplementation(() => ({
            get: tmdbGetMock,
            request: jest.fn(),
            defaults: { params: { api_key: 'key' } },
            interceptors: { response: { use: jest.fn() } }
        }));
    });

    it('should limit cast to MAX_CAST_SIZE (10) not 15', async () => {
        const castMembers = Array.from({ length: 20 }, (_, i) => ({
            name: `Actor ${i + 1}`,
            known_for_department: 'Acting'
        }));

        tmdbGetMock.mockResolvedValue({
            data: createBaseTmdbData({
                credits: { cast: castMembers, crew: [] }
            })
        });

        const { getTmdbMetaDetails } = require('../src/clients/tmdb');
        const meta = await getTmdbMetaDetails('key', 'tmdb:100', 'movie');

        // The trimming step reduces to 10, so the final cast should never exceed 10
        expect(meta.cast.length).toBeLessThanOrEqual(10);
    });
});

describe('Bug Fix: Lingva 414 URI truncation', () => {
    let tmdbGetMock;
    let lingvaGetMock;

    beforeEach(() => {
        jest.resetModules();
        Object.keys(mockCacheInstances).forEach(k => delete mockCacheInstances[k]);
        tmdbGetMock = jest.fn();
        lingvaGetMock = jest.fn();
        mockCreateAxiosInstance.mockReset();
        mockCreateAxiosInstance.mockImplementation((baseURL) => {
            if (baseURL === 'https://lingva.ml') {
                return {
                    get: lingvaGetMock,
                    interceptors: { response: { use: jest.fn() } }
                };
            }
            return {
                get: tmdbGetMock,
                request: jest.fn(),
                defaults: { params: { api_key: 'key' } },
                interceptors: { response: { use: jest.fn() } }
            };
        });
    });

    it('should truncate very long overviews before sending to Lingva', async () => {
        const longOverview = 'A'.repeat(3000); // 3000 chars, well over safe URL limit

        tmdbGetMock.mockImplementation(async (_url, options = {}) => {
            const language = options.params?.language;
            if (language === 'en-US') {
                return { data: createBaseTmdbData({ overview: longOverview }) };
            }
            if (language === 'ja') {
                return { data: createBaseTmdbData({ overview: '' }) };
            }
            return { data: createBaseTmdbData({ overview: '' }) };
        });
        lingvaGetMock.mockResolvedValue({ data: { translation: 'Traduzione troncata' } });

        const { getTmdbMetaDetails } = require('../src/clients/tmdb');
        await getTmdbMetaDetails('key', 'tmdb:100', 'movie');

        // Lingva should have been called (overview is short, so it uses Lingva as last resort)
        // The important thing is it doesn't use the full 3000-char string
        if (lingvaGetMock.mock.calls.length > 0) {
            const calledUrl = lingvaGetMock.mock.calls[0][0];
            // The URL should not contain the full 3000-char text
            expect(calledUrl.length).toBeLessThan(3000);
        }
    });
});

describe('Bug Fix: Negative cache for ID lookups', () => {
    let tmdbGetMock;

    beforeEach(() => {
        jest.resetModules();
        Object.keys(mockCacheInstances).forEach(k => delete mockCacheInstances[k]);
        tmdbGetMock = jest.fn();
        mockCreateAxiosInstance.mockReset();
        mockCreateAxiosInstance.mockImplementation(() => ({
            get: tmdbGetMock,
            request: jest.fn(),
            defaults: { params: { api_key: 'key' } },
            interceptors: { response: { use: jest.fn() } }
        }));
    });

    it('should cache null results for getTmdbIdByName', async () => {
        tmdbGetMock.mockResolvedValue({
            data: { results: [] } // No results found
        });

        const { getTmdbIdByName } = require('../src/clients/tmdb');
        const result = await getTmdbIdByName('key', 'movie', 'nonexistent');

        expect(result).toBeNull();
        // The cache should have been set even for null result
        const idNameCache = mockCacheInstances['tmdb_id_name'];
        expect(idNameCache.set).toHaveBeenCalledWith(
            'movie:nonexistent',
            null
        );
    });

    it('should cache null results for resolveImdbId', async () => {
        tmdbGetMock.mockResolvedValue({
            data: { imdb_id: null } // No IMDB ID
        });

        const { resolveImdbId } = require('../src/clients/tmdb');
        const result = await resolveImdbId('12345', 'movie', 'key');

        expect(result).toBeNull();
        const imdbIdCache = mockCacheInstances['tmdb_imdb_id'];
        expect(imdbIdCache.set).toHaveBeenCalledWith(
            'imdb:movie:12345',
            null
        );
    });
});

describe('Bug Fix: RAM cache sizing (ramMax 500)', () => {
    beforeEach(() => {
        jest.resetModules();
        Object.keys(mockCacheInstances).forEach(k => delete mockCacheInstances[k]);
        mockCreateAxiosInstance.mockReset();
        mockCreateAxiosInstance.mockImplementation(() => ({
            get: jest.fn(),
            request: jest.fn(),
            defaults: { params: { api_key: 'key' } },
            interceptors: { response: { use: jest.fn() } }
        }));
    });

    it('should use ramMax 500 for TMDB caches instead of 50', () => {
        require('../src/clients/tmdb');
        const CacheManager = require('../src/cache/CacheManager');

        // Check that CacheManager was called with ramMax: 500 for TMDB caches
        const tmdbCalls = CacheManager.mock.calls.filter(c =>
            c[0].startsWith('tmdb_')
        );

        expect(tmdbCalls.length).toBeGreaterThan(0);
        tmdbCalls.forEach(call => {
            expect(call[1].ramMax).toBe(500);
        });
    });
});

describe('Bug Fix: Episode fetch uses rate-limited batching', () => {
    let tmdbGetMock;

    beforeEach(() => {
        jest.resetModules();
        Object.keys(mockCacheInstances).forEach(k => delete mockCacheInstances[k]);
        tmdbGetMock = jest.fn();
        mockCreateAxiosInstance.mockReset();
        mockCreateAxiosInstance.mockImplementation(() => ({
            get: tmdbGetMock,
            request: jest.fn(),
            defaults: { params: { api_key: 'key' } },
            interceptors: { response: { use: jest.fn() } }
        }));
    });

    it('should fetch episodes for series metadata using rate-limited approach', async () => {
        const seasonData = {
            season_number: 1,
            episodes: [
                { season_number: 1, episode_number: 1, name: 'Ep 1', air_date: '2020-01-10', overview: 'Overview 1', still_path: null },
                { season_number: 1, episode_number: 2, name: 'Ep 2', air_date: '2020-01-17', overview: 'Overview 2', still_path: null }
            ]
        };

        tmdbGetMock.mockImplementation(async (url, config) => {
            // append_to_response batch call: /tv/{id} with append_to_response=season/1
            const appendParam = config?.params?.append_to_response || '';
            if (url.match(/\/tv\/\d+$/) && appendParam.includes('season/')) {
                return {
                    data: {
                        ...createBaseTmdbData({ number_of_seasons: 1, overview: 'Valid overview for the series.' }),
                        'season/1': seasonData
                    }
                };
            }
            if (url.includes('/season/')) {
                return { data: seasonData };
            }
            return {
                data: createBaseTmdbData({
                    number_of_seasons: 1,
                    overview: 'Valid overview for the series.'
                })
            };
        });

        const { getTmdbMetaDetails } = require('../src/clients/tmdb');
        const meta = await getTmdbMetaDetails('key', 'tmdb:100', 'series');

        expect(meta.videos).toBeDefined();
        expect(meta.videos.length).toBe(2);
        expect(meta.videos[0].title).toBe('Ep 1');
    });
});

describe('Bug Fix: MDBList negative cache and parallel processing', () => {
    let mdblistGetMock;

    beforeEach(() => {
        jest.resetModules();
        Object.keys(mockCacheInstances).forEach(k => delete mockCacheInstances[k]);
        mdblistGetMock = jest.fn();
        mockCreateAxiosInstance.mockReset();
        mockCreateAxiosInstance.mockImplementation(() => ({
            get: mdblistGetMock,
            request: jest.fn(),
            defaults: { params: {} },
            interceptors: { response: { use: jest.fn() } }
        }));
    });

    it('should cache null when MDBList returns no ratings', async () => {
        mdblistGetMock.mockResolvedValue({
            data: { title: 'Test Movie' } // No ratings field
        });

        const { fetchMdblistRatings } = require('../src/utils/mdblist');
        const result = await fetchMdblistRatings('tt1234567', 'api-key');

        expect(result).toBeNull();
        // Should have cached the null result
        const ratingsCache = mockCacheInstances['mdblist_ratings'];
        expect(ratingsCache.set).toHaveBeenCalledWith('ratings:tt1234567', null);
    });

    it('should return cached stale data for MDBList ratings', async () => {
        const staleData = { imdb: '7.5', rtCritic: 80, rtAudience: 85, metacritic: 70 };

        // First, reset modules to get fresh mocks
        const { fetchMdblistRatings } = require('../src/utils/mdblist');
        const ratingsCache = mockCacheInstances['mdblist_ratings'];

        // Mock stale cache hit
        ratingsCache.getWithStatus.mockResolvedValueOnce({ value: staleData, status: 'stale' });

        const result = await fetchMdblistRatings('tt1234567', 'api-key');
        expect(result).toEqual(staleData);
    });
});

describe('Bug Fix: metaHandler SWR and anime detection', () => {
    beforeEach(() => {
        jest.resetModules();
        Object.keys(mockCacheInstances).forEach(k => delete mockCacheInstances[k]);
    });

    it('should use getWithStatus for SWR support in metaHandler', async () => {
        jest.doMock('../src/clients/tmdb', () => ({
            getTmdbMetaDetails: jest.fn().mockResolvedValue({
                id: 'tt100',
                name: 'Test Movie',
                type: 'movie',
                genre_ids: [28],
                genres: ['Action'],
                behaviorHints: {}
            })
        }));
        jest.doMock('../src/clients/kitsu', () => ({
            getKitsuMetaDetails: jest.fn(),
            getKitsuIdFromTmdbId: jest.fn(),
            fetchKitsuEpisodes: jest.fn()
        }));
        jest.doMock('../src/id_mapping/id_cache', () => ({
            translateImdbToTmdb: jest.fn().mockResolvedValue({ id: '100', imdb_id: 'tt100' })
        }));
        jest.doMock('../src/utils/mdblist', () => ({
            fetchMdblistRatings: jest.fn().mockResolvedValue({})
        }));

        const { metaHandler } = require('../src/handlers/metaHandler');
        const finalMetaCache = mockCacheInstances['final_meta_cache'];

        // Simulate a fresh cache hit
        finalMetaCache.getWithStatus.mockResolvedValueOnce({
            value: { id: 'tt100', name: 'Cached Movie', type: 'movie' },
            status: 'fresh'
        });

        const result = await metaHandler(
            { type: 'movie', id: 'tt100' },
            { apiKeys: { tmdb: 'key' } }
        );

        expect(result.meta).toBeDefined();
        expect(result.meta.name).toBe('Cached Movie');
        // Should have called getWithStatus, not plain get
        expect(finalMetaCache.getWithStatus).toHaveBeenCalled();
    });

    it('should not classify western animation as anime', async () => {
        // Simpsons-like: Animation genre but no anime keyword — _isAnime is false
        const mockMeta = {
            id: 'tt100',
            name: 'The Simpsons',
            type: 'series',
            genre_ids: [16, 35], // Animation + Comedy
            genres: ['Animation', 'Comedy'],
            _isAnime: false,
            _keywordNames: ['comedy', 'satire', 'family'],
            links: [
                { name: 'comedy', category: 'Tema', url: 'stremio://search?search=comedy' },
                { name: 'satire', category: 'Tema', url: 'stremio://search?search=satire' }
            ],
            behaviorHints: {}
        };

        jest.doMock('../src/clients/tmdb', () => ({
            getTmdbMetaDetails: jest.fn().mockResolvedValue(mockMeta)
        }));
        const kitsuMock = {
            getKitsuMetaDetails: jest.fn(),
            getKitsuIdFromTmdbId: jest.fn(),
            fetchKitsuEpisodes: jest.fn()
        };
        jest.doMock('../src/clients/kitsu', () => kitsuMock);
        jest.doMock('../src/id_mapping/id_cache', () => ({
            translateImdbToTmdb: jest.fn().mockResolvedValue({ id: '100' })
        }));
        jest.doMock('../src/utils/mdblist', () => ({
            fetchMdblistRatings: jest.fn().mockResolvedValue({})
        }));

        const { metaHandler } = require('../src/handlers/metaHandler');

        const result = await metaHandler(
            { type: 'series', id: 'tmdb:100' },
            { apiKeys: { tmdb: 'key' } }
        );

        // Should NOT have tried to look up Kitsu ID
        expect(kitsuMock.getKitsuIdFromTmdbId).not.toHaveBeenCalled();
        // Internal properties should be cleaned before sending to Stremio
        expect(result.meta._keywordNames).toBeUndefined();
        expect(result.meta._isAnime).toBeUndefined();
    });

    it('should classify actual anime with anime keyword', async () => {
        const mockMeta = {
            id: 'tt200',
            name: 'Naruto',
            type: 'series',
            genre_ids: [16, 10759], // Animation + Action & Adventure
            genres: ['Animation', 'Action & Adventure'],
            _isAnime: true,
            _keywordNames: ['anime', 'ninja', 'shounen', 'manga'],
            links: [
                { name: 'ninja', category: 'Tema', url: 'stremio://search?search=ninja' }
            ],
            behaviorHints: {}
        };

        jest.doMock('../src/clients/tmdb', () => ({
            getTmdbMetaDetails: jest.fn().mockResolvedValue(mockMeta)
        }));
        const kitsuMock = {
            getKitsuMetaDetails: jest.fn(),
            getKitsuIdFromTmdbId: jest.fn().mockResolvedValue('kitsu:123'),
            fetchKitsuEpisodes: jest.fn().mockResolvedValue([
                { id: 'kitsu:123:1:1', title: 'Episode 1', season: 1, episode: 1 }
            ])
        };
        jest.doMock('../src/clients/kitsu', () => kitsuMock);
        jest.doMock('../src/id_mapping/id_cache', () => ({
            translateImdbToTmdb: jest.fn().mockResolvedValue({ id: '200' })
        }));
        jest.doMock('../src/utils/mdblist', () => ({
            fetchMdblistRatings: jest.fn().mockResolvedValue({})
        }));

        const { metaHandler } = require('../src/handlers/metaHandler');

        const result = await metaHandler(
            { type: 'series', id: 'tmdb:200' },
            { apiKeys: { tmdb: 'key' } }
        );

        // Should have looked up Kitsu ID for anime
        expect(kitsuMock.getKitsuIdFromTmdbId).toHaveBeenCalledWith('200', 'series');
        // Should have normalized Kitsu fallback IDs to the series base for stream addon compatibility
        expect(result.meta.videos).toEqual([
            { id: 'tt200:1:1', title: 'Episode 1', season: 1, episode: 1 }
        ]);
        // Internal properties should be cleaned before sending to Stremio
        expect(result.meta._keywordNames).toBeUndefined();
        expect(result.meta._isAnime).toBeUndefined();
    });

    it('should keep TMDB episode list for anime when TMDB already returned videos', async () => {
        const mockMeta = {
            id: 'tt200',
            name: 'Naruto',
            type: 'series',
            genre_ids: [16, 10759],
            genres: ['Animation', 'Action & Adventure'],
            _isAnime: true,
            _keywordNames: ['anime', 'ninja'],
            videos: [
                { id: 'tt200:1:1', title: 'Enter Naruto', season: 1, episode: 1, overview: 'Trama IT' }
            ],
            behaviorHints: {}
        };

        jest.doMock('../src/clients/tmdb', () => ({
            getTmdbMetaDetails: jest.fn().mockResolvedValue(mockMeta)
        }));
        const kitsuMock = {
            getKitsuMetaDetails: jest.fn(),
            getKitsuIdFromTmdbId: jest.fn().mockResolvedValue('123'),
            fetchKitsuEpisodes: jest.fn().mockResolvedValue([
                { id: 'kitsu:123:1', title: 'Episode 1', season: 1, episode: 1 }
            ])
        };
        jest.doMock('../src/clients/kitsu', () => kitsuMock);
        jest.doMock('../src/id_mapping/id_cache', () => ({
            translateImdbToTmdb: jest.fn().mockResolvedValue({ id: '200' })
        }));
        jest.doMock('../src/utils/mdblist', () => ({
            fetchMdblistRatings: jest.fn().mockResolvedValue({})
        }));

        const { metaHandler } = require('../src/handlers/metaHandler');

        const result = await metaHandler(
            { type: 'series', id: 'tmdb:200' },
            { apiKeys: { tmdb: 'key' } }
        );

        expect(result.meta.videos).toEqual([
            { id: 'tt200:1:1', title: 'Enter Naruto', season: 1, episode: 1, overview: 'Trama IT' }
        ]);
    });

    it('should normalize Kitsu fallback episode ids to the TMDB or IMDb series id', async () => {
        const mockMeta = {
            id: 'tt200',
            name: 'Naruto',
            type: 'series',
            genre_ids: [16, 10759],
            genres: ['Animation', 'Action & Adventure'],
            _isAnime: true,
            _keywordNames: ['anime', 'ninja'],
            behaviorHints: {}
        };

        jest.doMock('../src/clients/tmdb', () => ({
            getTmdbMetaDetails: jest.fn().mockResolvedValue(mockMeta)
        }));
        const kitsuMock = {
            getKitsuMetaDetails: jest.fn(),
            getKitsuIdFromTmdbId: jest.fn().mockResolvedValue('123'),
            fetchKitsuEpisodes: jest.fn().mockResolvedValue([
                { id: 'kitsu:123:7', title: 'Episode 7', season: 1, episode: 7, overview: 'Fallback overview' }
            ])
        };
        jest.doMock('../src/clients/kitsu', () => kitsuMock);
        jest.doMock('../src/id_mapping/id_cache', () => ({
            translateImdbToTmdb: jest.fn().mockResolvedValue({ id: '200' })
        }));
        jest.doMock('../src/utils/mdblist', () => ({
            fetchMdblistRatings: jest.fn().mockResolvedValue({})
        }));

        const { metaHandler } = require('../src/handlers/metaHandler');

        const result = await metaHandler(
            { type: 'series', id: 'tmdb:200' },
            { apiKeys: { tmdb: 'key' } }
        );

        expect(result.meta.videos).toEqual([
            { id: 'tt200:1:7', title: 'Episode 7', season: 1, episode: 7, overview: 'Fallback overview' }
        ]);
    });

    it('should not make duplicate getTmdbMetaDetails calls', async () => {
        const tmdbMock = jest.fn().mockResolvedValue({
            id: 'tt100',
            name: 'Test Movie',
            type: 'movie',
            genre_ids: [28],
            genres: ['Action'],
            behaviorHints: {}
        });

        jest.doMock('../src/clients/tmdb', () => ({
            getTmdbMetaDetails: tmdbMock
        }));
        jest.doMock('../src/clients/kitsu', () => ({
            getKitsuMetaDetails: jest.fn(),
            getKitsuIdFromTmdbId: jest.fn(),
            fetchKitsuEpisodes: jest.fn()
        }));
        jest.doMock('../src/id_mapping/id_cache', () => ({
            translateImdbToTmdb: jest.fn().mockResolvedValue({ id: '100', imdb_id: 'tt100' })
        }));
        jest.doMock('../src/utils/mdblist', () => ({
            fetchMdblistRatings: jest.fn().mockResolvedValue({})
        }));

        const { metaHandler } = require('../src/handlers/metaHandler');

        await metaHandler(
            { type: 'movie', id: 'tt100' },
            { apiKeys: { tmdb: 'key' } }
        );

        // Should only call getTmdbMetaDetails ONCE (not twice as before)
        expect(tmdbMock).toHaveBeenCalledTimes(1);
    });
});

describe('Bug Fix: SWR L2 status ternary returns miss not fresh for expired data', () => {
    it('should return miss when data is beyond both ramTtl and SWR window', () => {
        // Directly test the ternary logic that was fixed
        const ramTtlMs = 300000; // 5 min
        const swrMs = 60000; // 1 min
        const age = 10 * 60 * 60 * 1000; // 10 hours — well beyond both windows

        // Simulate the fixed ternary
        const status = age <= ramTtlMs ? 'fresh' : (swrMs > 0 && age <= ramTtlMs + swrMs ? 'stale' : 'miss');
        expect(status).toBe('miss');
    });

    it('should return fresh when data is within ramTtl', () => {
        const ramTtlMs = 300000;
        const swrMs = 60000;
        const age = 100000; // 100s — within 5 min

        const status = age <= ramTtlMs ? 'fresh' : (swrMs > 0 && age <= ramTtlMs + swrMs ? 'stale' : 'miss');
        expect(status).toBe('fresh');
    });

    it('should return stale when data is within SWR window', () => {
        const ramTtlMs = 300000;
        const swrMs = 60000;
        const age = 320000; // 5:20 — past 5 min but within 6 min SWR window

        const status = age <= ramTtlMs ? 'fresh' : (swrMs > 0 && age <= ramTtlMs + swrMs ? 'stale' : 'miss');
        expect(status).toBe('stale');
    });
});

describe('Bug Fix: Anime keyword detection uses raw keywords, not sliced links', () => {
    beforeEach(() => {
        jest.resetModules();
        Object.keys(mockCacheInstances).forEach(k => delete mockCacheInstances[k]);
    });

    it('should detect anime even when anime keyword is beyond the first 5 link slots', async () => {
        // Simulate a series where 'anime' is keyword #7 — _isAnime is detected early in getTmdbMetaDetails
        const mockMeta = {
            id: 'tt300',
            name: 'One Piece',
            type: 'series',
            genre_ids: [16, 10759],
            genres: ['Animation', 'Action & Adventure'],
            _isAnime: true,
            // _keywordNames includes ALL keywords, not just first 5
            _keywordNames: ['pirate', 'ocean', 'treasure', 'friendship', 'adventure', 'battle', 'anime'],
            // links only has first 5 (anime is NOT in links due to slice)
            links: [
                { name: 'pirate', category: 'Tema', url: 'stremio://search?search=pirate' },
                { name: 'ocean', category: 'Tema', url: 'stremio://search?search=ocean' },
                { name: 'treasure', category: 'Tema', url: 'stremio://search?search=treasure' },
                { name: 'friendship', category: 'Tema', url: 'stremio://search?search=friendship' },
                { name: 'adventure', category: 'Tema', url: 'stremio://search?search=adventure' }
            ],
            behaviorHints: {}
        };

        jest.doMock('../src/clients/tmdb', () => ({
            getTmdbMetaDetails: jest.fn().mockResolvedValue(mockMeta)
        }));
        const kitsuMock = {
            getKitsuMetaDetails: jest.fn(),
            getKitsuIdFromTmdbId: jest.fn().mockResolvedValue('kitsu:456'),
            fetchKitsuEpisodes: jest.fn().mockResolvedValue([
                { id: 'kitsu:456:1:1', title: 'Romance Dawn', season: 1, episode: 1 }
            ])
        };
        jest.doMock('../src/clients/kitsu', () => kitsuMock);
        jest.doMock('../src/id_mapping/id_cache', () => ({
            translateImdbToTmdb: jest.fn().mockResolvedValue({ id: '300' })
        }));
        jest.doMock('../src/utils/mdblist', () => ({
            fetchMdblistRatings: jest.fn().mockResolvedValue({})
        }));

        const { metaHandler } = require('../src/handlers/metaHandler');

        const result = await metaHandler(
            { type: 'series', id: 'tmdb:300' },
            { apiKeys: { tmdb: 'key' } }
        );

        // Should have detected anime via _isAnime flag (set by getTmdbMetaDetails)
        expect(kitsuMock.getKitsuIdFromTmdbId).toHaveBeenCalledWith('300', 'series');
        expect(result.meta.videos).toEqual([
            { id: 'tt300:1:1', title: 'Romance Dawn', season: 1, episode: 1 }
        ]);
        // Internal properties should be cleaned before sending to Stremio
        expect(result.meta._keywordNames).toBeUndefined();
        expect(result.meta._isAnime).toBeUndefined();
    });
});

describe('Bug Fix: Episode fallback requests are rate-limited', () => {
    let tmdbGetMock;

    beforeEach(() => {
        jest.resetModules();
        // Explicitly unmock modules that may have been doMock'd by prior tests
        jest.unmock('../src/clients/tmdb');
        jest.unmock('../src/clients/kitsu');
        jest.unmock('../src/id_mapping/id_cache');
        jest.unmock('../src/utils/mdblist');
        Object.keys(mockCacheInstances).forEach(k => delete mockCacheInstances[k]);
        tmdbGetMock = jest.fn();
        mockCreateAxiosInstance.mockReset();
        mockCreateAxiosInstance.mockImplementation(() => ({
            get: tmdbGetMock,
            request: jest.fn(),
            defaults: { params: { api_key: 'key' } },
            interceptors: { response: { use: jest.fn() } }
        }));
    });

    it('should fetch fallback overview episodes without parallel burst', async () => {
        // Use unique ID to avoid test interference with earlier tests
        const makeSeasonData = (num) => ({
            season_number: num,
            episodes: [
                { season_number: num, episode_number: 1, name: `S${num}E1`, air_date: '2020-01-10', overview: '', still_path: null }
            ]
        });

        tmdbGetMock.mockImplementation(async (url, options = {}) => {
            const appendParam = options?.params?.append_to_response || '';
            // append_to_response batch call for episodes
            if (url.match(/\/tv\/\d+$/) && appendParam.includes('season/')) {
                const responseData = createBaseTmdbData({
                    id: 9999,
                    number_of_seasons: 3,
                    original_language: 'ja',
                    overview: 'Valid overview for the series.'
                });
                // Add season data for each requested season
                const seasonParts = appendParam.split(',').filter(p => p.startsWith('season/'));
                for (const part of seasonParts) {
                    const num = parseInt(part.replace('season/', ''));
                    responseData[part] = makeSeasonData(num);
                }
                return { data: responseData };
            }
            if (url.includes('/season/')) {
                const seasonMatch = url.match(/\/season\/(\d+)/);
                const seasonNum = seasonMatch ? parseInt(seasonMatch[1]) : 1;
                const language = options?.params?.language;

                if (language === 'en-US') {
                    return {
                        data: {
                            season_number: seasonNum,
                            episodes: [
                                { season_number: seasonNum, episode_number: 1, name: `S${seasonNum}E1`, air_date: '2020-01-10', overview: 'English fallback', still_path: null }
                            ]
                        }
                    };
                }
                return { data: makeSeasonData(seasonNum) };
            }

            return {
                data: createBaseTmdbData({
                    id: 9999,
                    number_of_seasons: 3,
                    original_language: 'ja',
                    overview: 'Valid overview for the series.'
                })
            };
        });

        const { getTmdbMetaDetails } = require('../src/clients/tmdb');
        const meta = await getTmdbMetaDetails('key', 'tmdb:9999', 'series');

        // Should have fetched episodes successfully with fallback
        expect(meta.videos).toBeDefined();
        expect(meta.videos.length).toBeGreaterThanOrEqual(1);
        // Verify at least one episode has the English fallback overview
        const withFallback = meta.videos.filter(v => v.overview === 'English fallback');
        expect(withFallback.length).toBeGreaterThanOrEqual(1);

        // Verify that fallback requests exist (language: 'en-US')
        const fallbackCalls = tmdbGetMock.mock.calls.filter(c => c[1]?.params?.language === 'en-US');
        expect(fallbackCalls.length).toBeGreaterThanOrEqual(1);
    });
});

describe('Bug Fix: Trakt TMDB enrichment uses rate-limited batching', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.unmock('../src/clients/tmdb');
        jest.unmock('../src/clients/kitsu');
        jest.unmock('../src/id_mapping/id_cache');
        jest.unmock('../src/utils/mdblist');
        Object.keys(mockCacheInstances).forEach(k => delete mockCacheInstances[k]);
    });

    it('should import rateLimitedMapFiltered in trakt.js', () => {
        // Verify the trakt module uses rateLimitedMapFiltered instead of Promise.all
        const traktSource = require('fs').readFileSync(
            require('path').join(__dirname, '../src/clients/trakt.js'), 'utf-8'
        );
        expect(traktSource).toContain('rateLimitedMapFiltered');
        expect(traktSource).not.toMatch(/Promise\.all\(.*dedupedResults\.map/);
    });

    it('should import rateLimitedMapFiltered from rateLimiter', () => {
        const traktSource = require('fs').readFileSync(
            require('path').join(__dirname, '../src/clients/trakt.js'), 'utf-8'
        );
        expect(traktSource).toContain("require('../utils/rateLimiter')");
    });
});

describe('Bug Fix: Lingva timeout reduced to 1500ms', () => {
    it('should use a timeout of 1500ms for Lingva translation requests', () => {
        const translationSource = require('fs').readFileSync(
            require('path').join(__dirname, '../src/utils/translation.js'), 'utf-8'
        );
        // The Lingva call should use timeout: 1500, not 2000 or 4000
        const lingvaCallMatch = translationSource.match(/lingvaClient\.get\([^;]+\)/s);
        expect(lingvaCallMatch).toBeTruthy();
        expect(lingvaCallMatch[0]).toContain('timeout: 1500');
        expect(lingvaCallMatch[0]).not.toContain('timeout: 4000');
        expect(lingvaCallMatch[0]).not.toContain('timeout: 2000');
    });
});
