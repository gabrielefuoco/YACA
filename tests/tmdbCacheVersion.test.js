const mockCreateAxiosInstance = jest.fn();

const mockCacheInstances = new Map();

jest.mock('../src/utils/httpClient', () => ({
    createAxiosInstance: mockCreateAxiosInstance
}));

jest.mock('../src/models/TmdbRequestCache', () => ({
    get: jest.fn(),
    getWithStatus: jest.fn().mockResolvedValue({ value: undefined, status: 'miss' }),
    set: jest.fn()
}));

jest.mock('../src/utils/releaseFilter', () => ({
    isMovieReleasedDigitally: jest.fn()
}));

jest.mock('../src/utils/requestHash', () => ({
    generateRequestHash: jest.fn(() => 'hash')
}));

jest.mock('../src/cache/CacheManager', () => {
    return jest.fn().mockImplementation((namespace) => {
        const instance = {
            get: jest.fn().mockResolvedValue(undefined),
            getWithStatus: jest.fn().mockResolvedValue({ value: undefined, status: 'miss' }),
            set: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
            clear: jest.fn().mockResolvedValue(undefined)
        };
        mockCacheInstances.set(namespace, instance);
        return instance;
    });
});

describe('tmdb details cache key versioning', () => {
    let tmdbGetMock;

    beforeEach(() => {
        jest.resetModules();
        mockCacheInstances.clear();
        tmdbGetMock = jest.fn().mockResolvedValue({
            data: {
                id: 100,
                title: 'Titolo',
                original_title: 'Original title',
                original_language: 'en',
                release_date: '2020-01-01',
                poster_path: '/default.jpg',
                backdrop_path: '/bg.jpg',
                overview: 'A valid long description',
                vote_average: 7.2,
                genres: [],
                credits: { cast: [], crew: [] },
                images: { logos: [], backdrops: [], posters: [] },
                videos: { results: [] },
                external_ids: { imdb_id: 'tt100' },
                release_dates: { results: [] },
                content_ratings: { results: [] },
                keywords: { keywords: [], results: [] }
            }
        });

        mockCreateAxiosInstance.mockReset();
        mockCreateAxiosInstance.mockImplementation(() => ({
            get: tmdbGetMock,
            request: jest.fn(),
            defaults: { params: { api_key: 'key' } },
            interceptors: { response: { use: jest.fn() } }
        }));
    });

    it('uses versioned cache key for full metadata', async () => {
        const { getTmdbMetaDetails } = require('../src/clients/tmdb');
        await getTmdbMetaDetails('key', 'tmdb:100', 'movie');

        const detailsCache = mockCacheInstances.get('tmdb_details_raw');
        expect(detailsCache.getWithStatus).toHaveBeenCalledWith('full:v2:movie:100');
    });
});
