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

jest.mock('../src/cache/CacheManager', () => {
    return jest.fn().mockImplementation(() => ({
        get: jest.fn().mockResolvedValue(undefined),
        getWithStatus: jest.fn().mockResolvedValue({ value: undefined, status: 'miss' }),
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined)
    }));
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

describe('TMDB anime metadata fallbacks', () => {
    let tmdbGetMock;
    let lingvaGetMock;

    beforeEach(() => {
        jest.resetModules();
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

    it('prefers EN poster over JP default poster when IT poster is missing', async () => {
        tmdbGetMock.mockImplementation(async () => ({
            data: createBaseTmdbData({
                poster_path: '/jp_default.jpg',
                images: {
                    logos: [],
                    backdrops: [],
                    posters: [
                        { iso_639_1: 'ja', file_path: '/jp_poster.jpg' },
                        { iso_639_1: 'en', file_path: '/en_poster.jpg' },
                        { iso_639_1: null, file_path: '/null_poster.jpg' }
                    ]
                }
            })
        }));

        const { getTmdbMetaDetails } = require('../src/clients/tmdb');
        const meta = await getTmdbMetaDetails('key', 'tmdb:100', 'movie');

        expect(meta.poster).toBe('https://image.tmdb.org/t/p/w500/en_poster.jpg');
    });

    it('uses clean EN overview as real metadata without forcing Lingva translation', async () => {
        tmdbGetMock.mockImplementation(async (_url, options = {}) => {
            const language = options.params?.language;
            if (language === 'en-US') {
                return {
                    data: createBaseTmdbData({
                        overview: 'A complete and valid english overview used as real metadata.'
                    })
                };
            }
            if (language === 'ja') {
                return {
                    data: createBaseTmdbData({
                        overview: '原文の概要'
                    })
                };
            }
            return {
                data: createBaseTmdbData({
                    overview: ''
                })
            };
        });

        const { getTmdbMetaDetails } = require('../src/clients/tmdb');
        const meta = await getTmdbMetaDetails('key', 'tmdb:100', 'movie');

        expect(meta.description).toContain('A complete and valid english overview used as real metadata.');
        expect(lingvaGetMock).not.toHaveBeenCalled();
    });

    it('uses Lingva only as last resort when real overview metadata is unusable', async () => {
        tmdbGetMock.mockImplementation(async (_url, options = {}) => {
            const language = options.params?.language;
            if (language === 'en-US') {
                return {
                    data: createBaseTmdbData({
                        overview: 'short'
                    })
                };
            }
            if (language === 'ja') {
                return {
                    data: createBaseTmdbData({
                        overview: ''
                    })
                };
            }
            return {
                data: createBaseTmdbData({
                    overview: ''
                })
            };
        });
        lingvaGetMock.mockResolvedValue({ data: { translation: 'Traduzione finale da Lingva' } });

        const { getTmdbMetaDetails } = require('../src/clients/tmdb');
        const meta = await getTmdbMetaDetails('key', 'tmdb:100', 'movie');

        expect(lingvaGetMock).toHaveBeenCalledTimes(1);
        expect(meta.description).toContain('Traduzione finale da Lingva');
    });

    it('fills missing episode overviews from EN season metadata', async () => {
        tmdbGetMock.mockImplementation(async (url, options = {}) => {
            const language = options.params?.language;
            const appendParam = options.params?.append_to_response || '';

            if (url === '/tv/100') {
                // append_to_response batch call for episodes
                if (appendParam.includes('season/')) {
                    const baseData = createBaseTmdbData({ overview: '', number_of_seasons: 1 });
                    baseData['season/1'] = {
                        season_number: 1,
                        episodes: [
                            { season_number: 1, episode_number: 1, name: 'Episode 1', air_date: '2020-01-10', overview: '', still_path: null }
                        ]
                    };
                    return { data: baseData };
                }
                if (language === 'en-US') {
                    return { data: createBaseTmdbData({ overview: 'English overview for series', number_of_seasons: 1 }) };
                }
                if (language === 'ja') {
                    return { data: createBaseTmdbData({ overview: '日本語の概要', number_of_seasons: 1 }) };
                }
                return { data: createBaseTmdbData({ overview: '', number_of_seasons: 1 }) };
            }

            if (url === '/tv/100/season/1') {
                if (language === 'en-US') {
                    return {
                        data: {
                            season_number: 1,
                            episodes: [
                                { season_number: 1, episode_number: 1, name: 'Episode 1', air_date: '2020-01-10', overview: 'Episode overview in EN', still_path: null }
                            ]
                        }
                    };
                }
                if (language === 'ja') {
                    return {
                        data: {
                            season_number: 1,
                            episodes: [
                                { season_number: 1, episode_number: 1, name: 'Episode 1', air_date: '2020-01-10', overview: '', still_path: null }
                            ]
                        }
                    };
                }
                return {
                    data: {
                        season_number: 1,
                        episodes: [
                            { season_number: 1, episode_number: 1, name: 'Episode 1', air_date: '2020-01-10', overview: '', still_path: null }
                        ]
                    }
                };
            }

            return { data: createBaseTmdbData() };
        });

        const { getTmdbMetaDetails } = require('../src/clients/tmdb');
        const meta = await getTmdbMetaDetails('key', 'tmdb:100', 'series');

        expect(meta.videos).toHaveLength(1);
        expect(meta.videos[0].overview).toBe('Episode overview in EN');
    });
});
