const {
    ANIME_MARKER_DEFAULT,
    normalizeAnimeMarker
} = require('../src/utils/animeIdentity');
const { isItemAnime } = require('../src/handlers/catalogHandler');
const { applyKitsuMappingToMeta } = require('../src/handlers/metaHandler');
const { sanitizeCatalogMeta } = require('../src/catalog/formatters/StremioFormatter');
const animeMappingStore = require('../src/data/animeMappingStore');

describe('Ticket 28: contratto unico del marker _isAnime', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('il default documentato è false e viene propagato a catalogo e dettaglio', async () => {
        const catalogItem = {
            id: 'tmdb:1399',
            type: 'series',
            name: 'Il Trono di Spade',
            genre_ids: [16, 18],
            original_language: 'en'
        };

        expect(ANIME_MARKER_DEFAULT).toBe(false);
        expect(normalizeAnimeMarker(catalogItem)).toBe(false);
        expect(catalogItem._isAnime).toBe(false);
        expect(isItemAnime(catalogItem)).toBe(false);

        const formatted = sanitizeCatalogMeta(catalogItem, {
            shouldApplyEpisodeBadge: false,
            isLandscapeEnabled: false
        });
        expect(formatted._isAnime).toBe(false);

        const detail = {
            id: 'tmdb:1399',
            type: 'series',
            name: 'Il Trono di Spade',
            videos: [{ id: 'tmdb:1399:1:1', season: 1, episode: 1 }]
        };
        const resolveKitsu = jest.spyOn(animeMappingStore, 'resolveKitsu');

        await applyKitsuMappingToMeta(detail, 1399);

        expect(detail._isAnime).toBe(false);
        expect(detail.videos[0].id).toBe('tmdb:1399:1:1');
        expect(resolveKitsu).not.toHaveBeenCalled();
    });

    test('il resolver usa un solo default e non ricalcola un marker già propagato', () => {
        const mappingStore = { isAnimeTmdbId: jest.fn(() => true) };
        const item = { id: 'tmdb:12345', type: 'series' };

        expect(normalizeAnimeMarker(item, { mappingStore })).toBe(true);
        expect(normalizeAnimeMarker(item, { mappingStore })).toBe(true);
        expect(mappingStore.isAnimeTmdbId).toHaveBeenCalledTimes(1);
        expect(item._isAnime).toBe(true);
    });

    test('un boolean preesistente è autorevole anche se arrivesce altrove prova contraria', () => {
        const mappingStore = { isAnimeTmdbId: jest.fn(() => true) };
        const item = { id: 'tmdb:12345', _isAnime: false };

        expect(normalizeAnimeMarker(item, { mappingStore })).toBe(false);
        expect(mappingStore.isAnimeTmdbId).not.toHaveBeenCalled();
        expect(item._isAnime).toBe(false);
    });

    test('Kitsu e type anime sono prove positive normalizzate', () => {
        expect(normalizeAnimeMarker({ id: 'kitsu:46925' })).toBe(true);
        expect(normalizeAnimeMarker({ id: 'custom:1', type: 'anime' })).toBe(true);
    });
});
