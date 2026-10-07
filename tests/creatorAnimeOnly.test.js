const { buildPresetFromFilters } = require('../src/catalog/providers/DuckDbProvider');
const { normalizeToUniversalSchema } = require('../src/utils/resultMerger');
const { sanitizeCustomCatalog, sanitizeCustomCatalogs } = require('../src/api/configure/validators');
const { F } = require('../src/data/filters');

describe('Creator Solo Anime Tag & Engine Filtering', () => {
    describe('(a) Catalog with "solo anime" tag produces expected anime filter', () => {
        it('buildPresetFromFilters includes F.animeOf("movie") in where clause when isAnime: true in query', () => {
            const queryWithAnime = {
                strategy: 'discovery',
                with_genres: '28',
                isAnime: true
            };

            const preset = buildPresetFromFilters(queryWithAnime, 'movie');
            expect(preset.where).toContain(F.animeOf('movie'));
        });

        it('buildPresetFromFilters includes F.animeOf("tv") when options.isAnime: true', () => {
            const query = {
                strategy: 'discovery',
                with_genres: '28'
            };

            const preset = buildPresetFromFilters(query, 'series', { isAnime: true });
            expect(preset.where).toContain(F.animeOf('tv'));
        });

        it('F.animeOf recognizes "anime" as tv alias and throws on unrecognized types', () => {
            expect(F.animeOf('anime')).toBe(F.animeOf('tv'));
            expect(F.animeOf('series')).toBe(F.animeOf('tv'));
            expect(F.animeOf('movie')).not.toBe(F.animeOf('tv'));
            expect(() => F.animeOf(undefined)).toThrow('F.animeOf: tipo non riconosciuto: undefined');
            expect(() => F.animeOf(null)).toThrow('F.animeOf: tipo non riconosciuto: null');
            expect(() => F.animeOf('')).toThrow('F.animeOf: tipo non riconosciuto: ');
            expect(() => F.animeOf('unknown')).toThrow('F.animeOf: tipo non riconosciuto: unknown');
        });

        it('normalizeToUniversalSchema propagates isAnime to all queries and top-level schema', () => {
            const animeCatalog = {
                id: 'custom_anime_1',
                name: 'Miei Anime Shonen',
                type: 'series',
                isAnime: true,
                queries: [
                    { strategy: 'discovery', with_genres: '28' },
                    { strategy: 'discovery', with_genres: '12' }
                ]
            };

            const normalized = normalizeToUniversalSchema(animeCatalog);
            expect(normalized.isAnime).toBe(true);
            expect(normalized.queries[0].isAnime).toBe(true);
            expect(normalized.queries[1].isAnime).toBe(true);
        });

        it('sanitizeCustomCatalog validates and preserves isAnime: true across catalog, filters, and queries', () => {
            const catalog = {
                id: 'custom_anime_hero',
                name: 'Anime Autunno',
                type: 'series',
                isAnime: true,
                filters: {
                    strategy: 'discovery',
                    with_genres: '16'
                },
                queries: [
                    { strategy: 'discovery', with_genres: '16' }
                ]
            };

            const sanitized = sanitizeCustomCatalog(catalog);
            expect(sanitized.isAnime).toBe(true);
            expect(sanitized.filters.isAnime).toBe(true);
            expect(sanitized.queries[0].isAnime).toBe(true);
        });
    });

    describe('(b) Standard catalog without anime tag remains untouched', () => {
        it('buildPresetFromFilters does NOT include F.animeOf when isAnime is not specified', () => {
            const standardQuery = {
                strategy: 'discovery',
                with_genres: '28'
            };

            const preset = buildPresetFromFilters(standardQuery, 'movie');
            expect(preset.where).not.toContain(F.animeOf('movie'));
        });

        it('normalizeToUniversalSchema leaves non-anime catalog intact without injecting isAnime', () => {
            const standardCatalog = {
                id: 'custom_cinema',
                name: 'Cinema D\'Autore',
                type: 'movie',
                queries: [
                    { strategy: 'discovery', with_original_language: 'it' }
                ]
            };

            const normalized = normalizeToUniversalSchema(standardCatalog);
            expect(normalized.isAnime).toBeUndefined();
            expect(normalized.queries[0].isAnime).toBeUndefined();
        });

        it('sanitizeCustomCatalog keeps non-anime catalog bit-by-bit identical', () => {
            const standardCatalog = {
                id: 'custom_classic',
                name: 'Grandi Classici',
                type: 'movie',
                provider: 'tmdb',
                filters: {
                    strategy: 'discovery',
                    with_original_language: 'en'
                }
            };

            const sanitized = sanitizeCustomCatalog(standardCatalog);
            expect(sanitized.isAnime).toBeUndefined();
            expect(sanitized.filters.isAnime).toBeUndefined();
            expect(sanitized.filters.with_original_language).toBe('en');
        });
    });

    describe('(c) Legacy provider: kitsu catalog continues to function and normalize', () => {
        it('normalizes legacy kitsu catalog to tmdb and respects isAnime if present or added', () => {
            const legacyKitsuCatalog = {
                id: 'custom_legacy_kitsu_1',
                name: 'Vecchi Anime Kitsu',
                type: 'series',
                provider: 'kitsu',
                isAnime: true,
                filters: {
                    provider: 'kitsu',
                    strategy: 'discovery'
                },
                queries: [
                    { provider: 'kitsu', strategy: 'discovery' }
                ]
            };

            const sanitized = sanitizeCustomCatalog(legacyKitsuCatalog);
            expect(sanitized.provider).toBe('tmdb');
            expect(sanitized.filters.provider).toBe('tmdb');
            expect(sanitized.queries[0].provider).toBe('tmdb');
            expect(sanitized.isAnime).toBe(true);
            expect(sanitized.filters.isAnime).toBe(true);
            expect(sanitized.queries[0].isAnime).toBe(true);

            // Normalized schema execution in DuckDB preset builder
            const preset = buildPresetFromFilters(sanitized.queries[0], 'series');
            expect(preset.where).toContain(F.animeOf('tv'));
        });

        it('legacy kitsu catalog without explicit isAnime still normalizes to tmdb without breaking', () => {
            const legacyKitsuCatalog = {
                id: 'custom_legacy_kitsu_2',
                name: 'Kitsu Catalog Old',
                type: 'series',
                provider: 'kitsu',
                filters: {
                    provider: 'kitsu',
                    strategy: 'discovery'
                }
            };

            const sanitized = sanitizeCustomCatalog(legacyKitsuCatalog);
            expect(sanitized.provider).toBe('tmdb');
            expect(sanitized.filters.provider).toBe('tmdb');

            const preset = buildPresetFromFilters(sanitized.filters, 'series');
            expect(preset).toBeDefined();
            expect(preset.where).not.toContain(F.animeOf('tv'));
        });
    });
});
