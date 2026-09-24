const { sanitizeCustomCatalog, sanitizeCustomCatalogs } = require('../src/api/configure/validators');

describe('Legacy Kitsu Custom Catalog Sanitizer', () => {
    it('normalizes legacy provider: kitsu to tmdb across catalog, filters, and queries', () => {
        const legacyCatalog = {
            id: 'custom_123',
            name: 'Miei Anime Legacy',
            type: 'series',
            provider: 'kitsu',
            filters: {
                provider: 'kitsu',
                strategy: 'discovery',
                _keywordNames: 'action, adventure'
            },
            queries: [
                {
                    provider: 'kitsu',
                    strategy: 'discovery',
                    _keywordNames: 'action, adventure'
                }
            ]
        };

        const sanitized = sanitizeCustomCatalog(legacyCatalog);

        expect(sanitized.provider).toBe('tmdb');
        expect(sanitized.filters.provider).toBe('tmdb');
        expect(sanitized.queries[0].provider).toBe('tmdb');
        expect(sanitized.filters._keywordNames).toBe('action, adventure');
        expect(sanitized.queries[0]._keywordNames).toBe('action, adventure');
        expect(sanitized.name).toBe('Miei Anime Legacy');
    });

    it('leaves standard tmdb custom catalogs untouched', () => {
        const standardCatalog = {
            id: 'custom_456',
            name: 'Cinema Italiano',
            type: 'movie',
            provider: 'tmdb',
            filters: {
                with_original_language: 'it'
            },
            queries: [
                {
                    strategy: 'discovery',
                    with_original_language: 'it'
                }
            ]
        };

        const sanitized = sanitizeCustomCatalog(standardCatalog);
        expect(sanitized.provider).toBe('tmdb');
        expect(sanitized.filters.with_original_language).toBe('it');
    });

    it('sanitizeCustomCatalogs handles arrays safely and handles null/undefined inputs', () => {
        expect(sanitizeCustomCatalogs(null)).toBeNull();
        expect(sanitizeCustomCatalogs(undefined)).toBeUndefined();

        const list = [
            { id: '1', provider: 'kitsu' },
            { id: '2', provider: 'tmdb' }
        ];

        const sanitizedList = sanitizeCustomCatalogs(list);
        expect(sanitizedList[0].provider).toBe('tmdb');
        expect(sanitizedList[1].provider).toBe('tmdb');
    });
});
