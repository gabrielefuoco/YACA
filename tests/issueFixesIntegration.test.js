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
        title: 'Test Movie',
        original_title: 'Original Title',
        name: 'Test Movie',
        original_name: 'Original Title',
        original_language: 'en',
        release_date: '2024-01-01',
        first_air_date: '2024-01-01',
        poster_path: '/poster.jpg',
        backdrop_path: '/bg.jpg',
        overview: 'A test movie description.',
        vote_average: 7.5,
        number_of_seasons: 0,
        genres: [{ id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }],
        credits: {
            cast: [{ name: 'Actor One', known_for_department: 'Acting' }],
            crew: [{ name: 'Director One', job: 'Director' }]
        },
        images: { logos: [], backdrops: [], posters: [] },
        videos: { results: [] },
        external_ids: { imdb_id: 'tt1234' },
        release_dates: { results: [] },
        content_ratings: { results: [] },
        keywords: { keywords: [{ id: 1, name: 'spy' }], results: [] },
        belongs_to_collection: { name: 'Test Saga' },
        ...overrides
    };
}

describe('Issue fixes integration', () => {
    let tmdbGetMock;

    beforeEach(() => {
        jest.clearAllMocks();
        tmdbGetMock = jest.fn();
        mockCreateAxiosInstance.mockReturnValue({
            get: tmdbGetMock,
            interceptors: { response: { use: jest.fn() } }
        });
    });

    describe('stremio:// protocol fix (Issue #2)', () => {
        it('should use stremio:// (double slash) not stremio:/// (triple slash) in genre links', () => {
            const { toStremioMetaItem } = require('../src/clients/tmdb');
            const data = createBaseTmdbData();
            const meta = toStremioMetaItem(data, 'movie');

            const genreLink = meta.links.find(l => l.category === 'Generi');
            expect(genreLink).toBeDefined();
            expect(genreLink.url).toMatch(/^stremio:\/\/search\?/);
            expect(genreLink.url).not.toMatch(/^stremio:\/\/\/search\?/);
        });

        it('should use stremio:// in cast links', () => {
            const { toStremioMetaItem } = require('../src/clients/tmdb');
            const data = createBaseTmdbData();
            const meta = toStremioMetaItem(data, 'movie');

            const castLink = meta.links.find(l => l.category === 'Cast');
            expect(castLink).toBeDefined();
            expect(castLink.url).toMatch(/^stremio:\/\/search\?/);
            expect(castLink.url).not.toMatch(/^stremio:\/\/\/search\?/);
        });

        it('should use stremio:// in director links', () => {
            const { toStremioMetaItem } = require('../src/clients/tmdb');
            const data = createBaseTmdbData();
            const meta = toStremioMetaItem(data, 'movie');

            const directorLink = meta.links.find(l => l.category === 'Regia');
            expect(directorLink).toBeDefined();
            expect(directorLink.url).toMatch(/^stremio:\/\/search\?/);
        });

        it('should use stremio:// in keyword links', () => {
            const { toStremioMetaItem } = require('../src/clients/tmdb');
            const data = createBaseTmdbData();
            const meta = toStremioMetaItem(data, 'movie');

            const kwLink = meta.links.find(l => l.category === 'Tema');
            expect(kwLink).toBeDefined();
            expect(kwLink.url).toMatch(/^stremio:\/\/search\?/);
        });

        it('should use stremio:// in saga links', () => {
            const { toStremioMetaItem } = require('../src/clients/tmdb');
            const data = createBaseTmdbData();
            const meta = toStremioMetaItem(data, 'movie');

            const sagaLink = meta.links.find(l => l.category === 'Saga');
            expect(sagaLink).toBeDefined();
            expect(sagaLink.url).toMatch(/^stremio:\/\/search\?/);
        });
    });

    describe('AL CINEMA prefix removal (Issue #3)', () => {
        it('should not prefix name with AL CINEMA for theatrical releases', () => {
            const { toStremioMetaItem } = require('../src/clients/tmdb');
            const data = createBaseTmdbData({
                release_dates: {
                    results: [{
                        iso_3166_1: 'IT',
                        release_dates: [{ type: 3 }]
                    }]
                }
            });
            const meta = toStremioMetaItem(data, 'movie');

            expect(meta.name).toBe('Test Movie');
            expect(meta.name).not.toContain('AL CINEMA');
        });

        it('should set inTheaters flag for theatrical releases', () => {
            const { toStremioMetaItem } = require('../src/clients/tmdb');
            const data = createBaseTmdbData({
                release_dates: {
                    results: [{
                        iso_3166_1: 'IT',
                        release_dates: [{ type: 3 }]
                    }]
                }
            });
            const meta = toStremioMetaItem(data, 'movie');

            expect(meta.inTheaters).toBe(true);
        });

        it('should set inTheaters to false for non-theatrical releases', () => {
            const { toStremioMetaItem } = require('../src/clients/tmdb');
            const data = createBaseTmdbData();
            const meta = toStremioMetaItem(data, 'movie');

            expect(meta.inTheaters).toBe(false);
        });
    });

    describe('formatRichDescription separator removal (Issue #3)', () => {
        it('should not contain separator line characters', () => {
            const { formatRichDescription } = require('../src/clients/tmdb');
            const data = createBaseTmdbData();
            const desc = formatRichDescription(data, 'movie', { imdb: '7.5' });

            expect(desc).not.toContain('━');
        });

        it('should not contain triple newlines', () => {
            const { formatRichDescription } = require('../src/clients/tmdb');
            const data = createBaseTmdbData();
            const desc = formatRichDescription(data, 'movie');

            expect(desc).not.toContain('\n\n\n');
        });

        it('should still contain vote scores when present', () => {
            const { formatRichDescription } = require('../src/clients/tmdb');
            const data = createBaseTmdbData({ vote_average: 8.0 });
            const desc = formatRichDescription(data, 'movie', { imdb: '8.0' });

            expect(desc).toContain('⭐ 8.0 TMDB');
            expect(desc).toContain('🆔 IMDb 8.0');
        });
    });
});
