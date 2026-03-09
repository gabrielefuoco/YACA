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

jest.mock('../src/db/models/UserList', () => ({
    findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) }))
}));

jest.mock('../src/db/models/TasteProfile', () => ({
    findOne: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/db/models/UserActivity', () => ({
    create: jest.fn().mockResolvedValue(null),
    find: jest.fn(() => ({ sort: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([]) })) }))
}));

jest.mock('../src/profile/ProfileScorer', () => ({
    calculateItemMatch: jest.fn(() => 0)
}));

jest.mock('../src/db/models/CacheEntry', () => ({
    find: jest.fn(() => ({ limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })) }))
}));

jest.mock('../src/data/presets', () => ({
    getPresets: jest.fn(() => [])
}));

jest.mock('../src/utils/imageProcessor', () => ({
    addBadgeToImage: jest.fn((url, text) => `https://ik.imagekit.io/test-id/badge/${encodeURIComponent(text)}/${encodeURIComponent(url)}`)
}));

const { fetchTmdbCatalog } = require('../src/clients/tmdb');
const { getPresets } = require('../src/data/presets');
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

    const userConfig = {
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
    };

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.HOST_URL;
        getPresets.mockReturnValue([
            { id: 'preset_new_series_eps', filters: { sort_by: 'popularity.desc' } }
        ]);

        fetchTmdbCatalog.mockResolvedValue(
            mockMetasWithVideos.map(m => ({ ...m, poster: m.poster, videos: [...m.videos] }))
        );
    });

    it('should generate direct ImageKit URL for badge poster', async () => {
        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_preset_preset_new_series_eps',
            extra: { skip: 0 }
        }, userConfig, 'https://my-server.com');

        expect(result.metas[0].poster).toContain('https://ik.imagekit.io/test-id/badge/');
        expect(result.metas[0].poster).not.toContain('/badge/poster.jpg');
    });

    it('should not depend on HOST_URL env var for badge URL generation', async () => {
        process.env.HOST_URL = 'https://env-server.com';

        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_preset_preset_new_series_eps',
            extra: { skip: 0 }
        }, userConfig);

        expect(result.metas[0].poster).toContain('https://ik.imagekit.io/test-id/badge/');
    });

    it('should not fall back to localhost badge proxy URL', async () => {
        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_preset_preset_new_series_eps',
            extra: { skip: 0 }
        }, userConfig);

        expect(result.metas[0].poster).toContain('https://ik.imagekit.io/test-id/badge/');
        expect(result.metas[0].poster).not.toContain('http://localhost:7000/badge/poster.jpg');
    });

    it('should include encoded original poster URL in direct ImageKit URL', async () => {
        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_preset_preset_new_series_eps',
            extra: { skip: 0 }
        }, userConfig, 'https://my-server.com');

        const posterUrl = result.metas[0].poster;
        expect(posterUrl).toContain(encodeURIComponent('https://image.tmdb.org/t/p/w500/test.jpg'));
    });

    it('should include episode badge text in URL', async () => {
        const result = await catalogHandler({
            type: 'series',
            id: 'yaca_preset_preset_new_series_eps',
            extra: { skip: 0 }
        }, userConfig, 'https://my-server.com');

        const posterUrl = result.metas[0].poster;
        expect(posterUrl).toContain(encodeURIComponent('Ep 5'));
    });

    afterEach(() => {
        delete process.env.HOST_URL;
    });
});
