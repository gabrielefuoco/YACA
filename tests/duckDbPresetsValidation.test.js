const { getPresets } = require('../src/data/presets');
const { buildCatalogQuery } = require('../src/db/queryBuilder');
const duckDbStore = require('../src/db/duckDbStore');
const { sanitizeCatalogMeta } = require('../src/catalog/formatters/StremioFormatter');
const { aiPromptCache, catalogRequestCache, catalogFallbackCache, simulcastDatesCache } = require('../src/cache/cacheInstances');
const LibrarySyncService = require('../src/services/LibrarySyncService');
const CacheManager = require('../src/cache/CacheManager');

describe('DuckDB Native Presets & Architectural Optimizations', () => {
    beforeAll(async () => {
        await duckDbStore.init();
    }, 30000);

    test('All presets define native where and orderBy except simulcast', async () => {
        const presets = getPresets();
        expect(presets.length).toBe(160);

        for (const preset of presets) {
            if (preset.id === 'preset_anime_simulcast') {
                // Il simulcast ora nasce dallo stato esterno (anime_airing_state), non da AniList:
                // nessuna where nativa, solo il marker del provider.
                expect(preset.where).toBeUndefined();
                expect(preset._provider).toBe('airing_state');
            } else {
                expect(Array.isArray(preset.where)).toBe(true);
                expect(typeof preset.orderBy).toBe('string');
                expect(preset.queries).toBeDefined();
                expect(preset.queries.length).toBeGreaterThan(0);

                // Build catalog query and verify it is valid SQL for DuckDB
                const sql = await buildCatalogQuery({
                    type: preset.type || 'movie',
                    where: preset.where,
                    orderBy: preset.orderBy
                }, 0, 10);

                expect(sql).toContain('SELECT * FROM');
                // Execute against in-memory DuckDB
                await expect(duckDbStore.query(sql)).resolves.toBeDefined();
            }
        }
    }, 30000);

    test('StremioFormatter payload diet: trailers excluded from catalog, included in meta detail', () => {
        const sampleItem = {
            id: 'tmdb:550',
            name: 'Fight Club',
            type: 'movie',
            trailers: [{ source: 'youtube', id: 'O1DTD_A8gkM' }],
            videos: [{ id: 'v1' }]
        };

        const catalogItem = sanitizeCatalogMeta(sampleItem, {});
        expect(catalogItem.trailers).toBeUndefined();
        expect(catalogItem.videos).toBeUndefined();

        const metaDetailItem = sanitizeCatalogMeta(sampleItem, { isMetaDetail: true });
        expect(metaDetailItem.trailers).toBeDefined();
        expect(metaDetailItem.trailers).toEqual(sampleItem.trailers);
        expect(metaDetailItem.videos).toBeDefined();
    });

    test('Cache RAM tuning: ramMax limits calibrated for container environment', () => {
        expect(aiPromptCache.lruFallback.max).toBe(50);
        expect(catalogFallbackCache.lruFallback.max).toBe(100);
        expect(catalogRequestCache.lruFallback.max).toBe(150);
        expect(simulcastDatesCache.lruFallback.max).toBe(100);

        const defaultManager = new CacheManager('test_default');
        expect(defaultManager.lruFallback.max).toBe(200);
    });

    test('LibrarySyncService has syncTraktLibraryForUser and syncLibraryForUser', () => {
        expect(typeof LibrarySyncService.syncLibraryForUser).toBe('function');
        expect(typeof LibrarySyncService.syncTraktLibraryForUser).toBe('function');
    });
});
