const {
    ANIME_MARKER_DEFAULT,
    normalizeAnimeMarker,
    isAnimeContent
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

describe('Ticket 13: propagazione media type (movie vs tv) allo store anime', () => {
    test('stub store: isAnimeContent inoltra tipo ("movie" e "tv") allo store e rispetta il responso', () => {
        const seen = [];
        const fakeStore = {
            isAnimeTmdbId: (id, tipo) => {
                seen.push(String(tipo));
                return true;
            }
        };

        // Ritorna true perché fakeStore dice true, e fakeStore ha ricevuto 'movie'
        const isMovieAnime = isAnimeContent({
            tmdbId: 38251,
            genreIds: [35, 10749, 10752],
            originalLanguage: 'it',
            tipo: 'movie',
            mappingStore: fakeStore
        });
        expect(isMovieAnime).toBe(true);
        expect(seen[0]).toBe('movie');

        // La controparte serie inoltra 'tv'
        const isTvAnime = isAnimeContent({
            tmdbId: 38251,
            genreIds: [35, 10749, 10752],
            originalLanguage: 'it',
            tipo: 'tv',
            mappingStore: fakeStore
        });
        expect(isTvAnime).toBe(true);
        expect(seen[1]).toBe('tv');
        expect(seen).toEqual(['movie', 'tv']);
    });

    test('il percorso content-only funziona correttamente senza store', () => {
        // Anime reale riconosciuto da genre 16 e lingua ja
        expect(isAnimeContent({
            tmdbId: 667520,
            genreIds: [16, 18, 10749, 14],
            originalLanguage: 'ja',
            tipo: 'movie'
        })).toBe(true);

        // Film italiano non-anime senza corrispondenza store né generi anime
        expect(isAnimeContent({
            tmdbId: 38251,
            genreIds: [35, 10749, 10752],
            originalLanguage: 'it',
            tipo: 'movie'
        })).toBe(false);
    });

    test('normalizeAnimeMarker estrae tipo da item.type o options.tipo e lo inoltra a isAnimeContent', () => {
        const seen = [];
        const fakeStore = {
            isAnimeTmdbId: (id, tipo) => {
                seen.push({ id, tipo: String(tipo) });
                return false;
            }
        };

        // Da item.type 'movie'
        const movieItem = { id: 'tmdb:38251', type: 'movie' };
        normalizeAnimeMarker(movieItem, { mappingStore: fakeStore });
        expect(seen).toContainEqual({ id: '38251', tipo: 'movie' });

        // Da item.type 'series' -> normalizzato a 'tv'
        const seriesItem = { id: 'tmdb:38251', type: 'series' };
        normalizeAnimeMarker(seriesItem, { mappingStore: fakeStore });
        expect(seen).toContainEqual({ id: '38251', tipo: 'tv' });

        // Da options.tipo esplicito
        const genericItem = { id: 'tmdb:999' };
        normalizeAnimeMarker(genericItem, { tipo: 'movie', mappingStore: fakeStore });
        expect(seen).toContainEqual({ id: '999', tipo: 'movie' });
    });
});

