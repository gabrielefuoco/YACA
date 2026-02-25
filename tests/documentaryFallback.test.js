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

const { fetchTmdbCatalog } = require('../src/clients/tmdb');
const UserConfig = require('../src/models/UserConfig');
const { catalogHandler } = require('../src/handlers/catalogHandler');

describe('catalogHandler documentary fallback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('retries documentary catalogs without keywords when first query is empty', async () => {
        UserConfig.findOne.mockResolvedValue({
            apiKeys: { tmdb: 'tmdb_key' },
            catalogs: [{ id: 'doc_cat', filters: { with_genres: '99', with_keywords: '6075', sort_by: 'popularity.desc' } }]
        });

        fetchTmdbCatalog
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'series_1' }]);

        const result = await catalogHandler({
            type: 'series',
            id: 'doc_cat',
            extra: { skip: 0 }
        }, 'uuid-1');

        expect(fetchTmdbCatalog).toHaveBeenCalledTimes(2);
        expect(fetchTmdbCatalog.mock.calls[0][3]).toEqual(expect.objectContaining({ with_keywords: '6075' }));
        expect(fetchTmdbCatalog.mock.calls[1][3]).toEqual(expect.not.objectContaining({ with_keywords: expect.anything() }));
        expect(result).toEqual({ metas: [{ id: 'series_1' }] });
    });
});
