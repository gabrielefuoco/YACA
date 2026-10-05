/**
 * tests/libraryMediaTypeResolution.test.js
 *
 * Test unitari della regola di risoluzione del media type (Ticket 12 & Ticket 13).
 */

const {
    resolveItemMediaType,
    resolveTargetTableAndEndpoint
} = require('../src/services/libraryMediaTypeResolution');

describe('resolveItemMediaType', () => {
    test('item con type movie nativo restituisce movie', () => {
        expect(resolveItemMediaType({ type: 'movie' })).toBe('movie');
    });

    test('item con type series o tv nativo restituisce tv', () => {
        expect(resolveItemMediaType({ type: 'series' })).toBe('tv');
        expect(resolveItemMediaType({ type: 'tv' })).toBe('tv');
    });

    test('item anime con mediaType tv dall identity (Fribb) restituisce tv (es. kitsu:10 Monster)', () => {
        const item = { itemId: 'kitsu:10', type: 'anime' };
        const identity = { tmdbId: '30981', mediaType: 'tv' };
        expect(resolveItemMediaType(item, { identity })).toBe('tv');
    });

    test('item anime con mediaType movie dall identity (Fribb) restituisce movie (es. kitsu:142 Princess Mononoke)', () => {
        const item = { itemId: 'kitsu:142', type: 'anime' };
        const identity = { tmdbId: '128', mediaType: 'movie' };
        expect(resolveItemMediaType(item, { identity })).toBe('movie');
    });

    test('item anime con prefisso esplicito tmdb:tv: restituisce tv (es. tmdb:tv:270603)', () => {
        const item = { itemId: 'tmdb:tv:270603', type: 'anime' };
        expect(resolveItemMediaType(item)).toBe('tv');
    });

    test('item anime con artwork contenente tmdb:tv: restituisce tv', () => {
        const item = {
            itemId: 'tmdb:270603',
            type: 'anime',
            poster: 'https://images.metahub.space/poster/medium/tmdb:tv:270603/img.jpg'
        };
        expect(resolveItemMediaType(item)).toBe('tv');
    });

    test('item anime kitsu con store che dichiara tv', () => {
        const item = { itemId: 'kitsu:6448', type: 'anime' };
        const mockStore = {
            resolveMediaTypeFromKitsu: jest.fn(id => (id === '6448' ? 'tv' : null))
        };
        expect(resolveItemMediaType(item, { mappingStore: mockStore })).toBe('tv');
    });

    test('item anime kitsu con store che dichiara movie', () => {
        const item = { itemId: 'kitsu:534', type: 'anime' };
        const mockStore = {
            resolveMediaTypeFromKitsu: jest.fn(id => (id === '534' ? 'movie' : null))
        };
        expect(resolveItemMediaType(item, { mappingStore: mockStore })).toBe('movie');
    });

    test('item anime con tmdbId e store che ha nodo anime tv', () => {
        const item = { itemId: 'tmdb:46298', tmdbId: '46298', type: 'anime' };
        const mockStore = {
            resolveMediaTypeDaTmdbId: jest.fn(id => (id === '46298' ? 'tv' : null))
        };
        expect(resolveItemMediaType(item, { mappingStore: mockStore })).toBe('tv');
    });

    test('item anime senza alcuna prova certa del tipo restituisce null (NON SI INDOVINA MAI)', () => {
        const item = { itemId: 'kitsu:999999', type: 'anime', tmdbId: '12345' };
        const mockStore = {
            resolveMediaTypeFromKitsu: jest.fn(() => null),
            resolveMediaTypeDaTmdbId: jest.fn(() => null),
            resolveKitsuMovie: jest.fn(() => null),
            tmdbToAnimeNode: new Map(),
            anibridgeShowTmdbIds: new Set(),
            anibridgeMovieTmdbIds: new Set()
        };
        expect(resolveItemMediaType(item, { mappingStore: mockStore })).toBeNull();
    });

    test('item nullo o non valido restituisce null', () => {
        expect(resolveItemMediaType(null)).toBeNull();
        expect(resolveItemMediaType({})).toBeNull();
    });
});

describe('resolveTargetTableAndEndpoint', () => {
    test('per tv restituisce tabella tv ed endpoint /tv/:id', () => {
        expect(resolveTargetTableAndEndpoint('tv', 30981)).toEqual({
            table: 'tv',
            endpoint: '/tv/30981'
        });
        expect(resolveTargetTableAndEndpoint('tv', 'tmdb:30981')).toEqual({
            table: 'tv',
            endpoint: '/tv/30981'
        });
    });

    test('per movie restituisce tabella movies ed endpoint /movie/:id', () => {
        expect(resolveTargetTableAndEndpoint('movie', 128)).toEqual({
            table: 'movies',
            endpoint: '/movie/128'
        });
    });

    test('per tipo null restituisce tabella null ed endpoint null', () => {
        expect(resolveTargetTableAndEndpoint(null, 128)).toEqual({
            table: null,
            endpoint: null
        });
    });

    test('per tmdbId mancante restituisce tabella null ed endpoint null', () => {
        expect(resolveTargetTableAndEndpoint('tv', null)).toEqual({
            table: null,
            endpoint: null
        });
    });
});
