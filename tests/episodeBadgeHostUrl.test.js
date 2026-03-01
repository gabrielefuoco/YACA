jest.mock('../src/clients/tmdb', () => ({
    fetchTmdbCatalog: jest.fn(),
    createTmdbClient: jest.fn(() => ({})),
    getTmdbIdByName: jest.fn()
}));

jest.mock('../src/clients/kitsu', () => ({
    fetchKitsuCatalog: jest.fn()
}));

jest.mock('../src/clients/trakt', () => ({
    fetchTraktCatalog: jest.fn()
}));

jest.mock('../src/utils/mdblist', () => ({
    fetchMDBListItems: jest.fn(),
    parseMDBListItems: jest.fn()
}));

jest.mock('../src/ai/router', () => ({
    routeLiveStremioSearch: jest.fn()
}));

jest.mock('../src/models/UserConfig', () => ({
    findOne: jest.fn()
}));

const UserConfig = require('../src/models/UserConfig');
const { fetchTmdbCatalog } = require('../src/clients/tmdb');
const { catalogHandler } = require('../src/handlers/catalogHandler');

describe('applyEpisodeBadge host URL handling', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // yesterday

    const mockMetasWithVideos = [
        {
            id: 'tmdb:1',
            type: 'series',
            name: 'Test Series',
            poster: 'https://image.tmdb.org/t/p/w500/test.jpg',
            videos: [
                { season: 1, episode: 5, released: pastDate }
            ]
        }
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.HOST_URL;

        UserConfig.findOne.mockResolvedValue({
            apiKeys: { tmdb: 'tmdb_key' },
            profiles: [{
                id: 'prof1',
                catalogs: [{
                    id: 'yaca_preset_preset_new_series_eps',
                    type: 'series',
                    filters: { sort_by: 'popularity.desc' }
                }],
                settings: {}
            }],
            activeProfileId: 'prof1'
        });

        fetchTmdbCatalog.mockResolvedValue(
            mockMetasWithVideos.map(m => ({ ...m, poster: m.poster, videos: [...m.videos] }))
        );
    });

    it('should use hostUrl parameter for badge poster URL', async () => {
        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_preset_preset_new_series_eps',
            extra: { skip: 0 }
        }, 'uuid-1', 'https://my-server.com');

        expect(result.metas[0].poster).toContain('https://my-server.com/badge/poster.jpg');
        expect(result.metas[0].poster).toContain('text=');
    });

    it('should fall back to HOST_URL env var when hostUrl not passed', async () => {
        process.env.HOST_URL = 'https://env-server.com';

        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_preset_preset_new_series_eps',
            extra: { skip: 0 }
        }, 'uuid-1');

        expect(result.metas[0].poster).toContain('https://env-server.com/badge/poster.jpg');
    });

    it('should fall back to localhost when neither hostUrl nor HOST_URL is set', async () => {
        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_preset_preset_new_series_eps',
            extra: { skip: 0 }
        }, 'uuid-1');

        expect(result.metas[0].poster).toContain('http://localhost:7000/badge/poster.jpg');
    });

    it('should include encoded original poster URL in badge URL', async () => {
        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_preset_preset_new_series_eps',
            extra: { skip: 0 }
        }, 'uuid-1', 'https://my-server.com');

        const posterUrl = result.metas[0].poster;
        expect(posterUrl).toContain(encodeURIComponent('https://image.tmdb.org/t/p/w500/test.jpg'));
    });

    it('should include episode badge text in URL', async () => {
        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_preset_preset_new_series_eps',
            extra: { skip: 0 }
        }, 'uuid-1', 'https://my-server.com');

        const posterUrl = result.metas[0].poster;
        // Episode 5, season 1 → should be "E5"
        expect(posterUrl).toContain('text=E5');
    });

    afterEach(() => {
        delete process.env.HOST_URL;
    });
});
