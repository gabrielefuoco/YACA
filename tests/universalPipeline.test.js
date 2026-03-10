/**
 * Tests for Universal Catalog Schema and Pipeline (v2.0):
 * 1. normalizeToUniversalSchema — backward compat with old formats
 * 2. interleaveMultipleResults — N-way interleaving
 * 3. Preset migration — all presets use queries[] array
 * 4. Keyword sanitization — mixed separator cleanup
 * 5. AI prompts — keyword mixing prevention rule
 */

jest.mock('../src/clients/tmdb', () => ({
    fetchTmdbCatalog: jest.fn(),
    createTmdbClient: jest.fn(() => ({})),
    getTmdbIdByName: jest.fn(),
    getTmdbMovieDetails: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/clients/kitsu', () => ({
    fetchKitsuCatalog: jest.fn(),
    fetchKitsuEpisodes: jest.fn()
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

jest.mock('../src/utils/imageProcessor', () => ({
    getImageKitUrl: jest.fn((url) => url)
}));

jest.mock('../src/engines/hybridRecommendations', () => ({
    getHybridCatalog: jest.fn()
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

jest.mock('../src/utils/rateLimiter', () => ({
    rateLimitedMap: jest.fn(async (items, fn) => Promise.all(items.map(fn)))
}));

jest.mock('../src/db/models/CacheEntry', () => ({
    find: jest.fn(() => ({ limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })) }))
}));

jest.mock('../src/data/presets', () => ({
    getPresets: jest.fn(() => [])
}));

jest.mock('../src/db/models/TmdbScoringData', () => ({
    find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) }))
}));

const { normalizeToUniversalSchema, interleaveMultipleResults, buildDiscoveryParams } = require('../src/handlers/catalogHandler');
const { getTmdbIdByName } = require('../src/clients/tmdb');

// ============================================
// Test 1: normalizeToUniversalSchema
// ============================================
describe('normalizeToUniversalSchema — backward compatibility', () => {
    it('converts old preset with filters to queries[] format', () => {
        const oldPreset = {
            id: 'preset_pop_movies',
            filters: { sort_by: 'popularity.desc', 'vote_count.gte': 100 }
        };
        const result = normalizeToUniversalSchema(oldPreset, null);
        expect(result.queries).toHaveLength(1);
        expect(result.queries[0].strategy).toBe('discovery');
        expect(result.queries[0].sort_by).toBe('popularity.desc');
        expect(result.queries[0]['vote_count.gte']).toBe(100);
        expect(result.presentation_strategy).toBe('popularity');
    });

    it('passes through new format with queries[] unchanged', () => {
        const newPreset = {
            id: 'test',
            queries: [
                { strategy: 'discovery', with_genres: '28' },
                { strategy: 'similar', similar_to: 'Avatar' }
            ],
            presentation_strategy: 'interleave'
        };
        const result = normalizeToUniversalSchema(newPreset, null);
        expect(result.queries).toHaveLength(2);
        expect(result.queries[0].strategy).toBe('discovery');
        expect(result.queries[1].strategy).toBe('similar');
        expect(result.presentation_strategy).toBe('interleave');
    });

    it('wraps directFilters in queries[] array', () => {
        const result = normalizeToUniversalSchema(null, { sort_by: 'vote_average.desc' });
        expect(result.queries).toHaveLength(1);
        expect(result.queries[0].strategy).toBe('discovery');
        expect(result.queries[0].sort_by).toBe('vote_average.desc');
    });

    it('handles merged catalog with merge config', () => {
        const merged = {
            sourceType: 'merged',
            mergedFrom: ['preset_a', 'preset_b'],
            filters: { merge: { catalogs: ['preset_a', 'preset_b'] } }
        };
        const result = normalizeToUniversalSchema(merged, null);
        expect(result._isMerge).toBe(true);
        expect(result._rawFilters).toBeDefined();
    });

    it('handles null catalogMeta gracefully', () => {
        const result = normalizeToUniversalSchema(null, null);
        expect(result.queries).toHaveLength(1);
        expect(result.presentation_strategy).toBe('popularity');
    });

    it('preserves weights from preset', () => {
        const preset = {
            queries: [{ strategy: 'discovery', with_genres: '28' }],
            presentation_strategy: 'popularity',
            weights: { tmdb: 1.5, trakt: 0.5 }
        };
        const result = normalizeToUniversalSchema(preset, null);
        expect(result.weights).toEqual({ tmdb: 1.5, trakt: 0.5 });
    });

    it('defaults presentation_strategy to popularity', () => {
        const preset = {
            queries: [{ strategy: 'discovery' }]
        };
        const result = normalizeToUniversalSchema(preset, null);
        expect(result.presentation_strategy).toBe('popularity');
    });
});

// ============================================
// Test 2: interleaveMultipleResults
// ============================================
describe('interleaveMultipleResults — N-way round-robin', () => {
    it('interleaves results from 3 query sources', () => {
        const a = [{ id: 'a1' }, { id: 'a2' }];
        const b = [{ id: 'b1' }, { id: 'b2' }];
        const c = [{ id: 'c1' }, { id: 'c2' }];

        const result = interleaveMultipleResults([a, b, c], 20);
        expect(result).toEqual([
            { id: 'a1' }, { id: 'b1' }, { id: 'c1' },
            { id: 'a2' }, { id: 'b2' }, { id: 'c2' }
        ]);
    });

    it('deduplicates items across sources', () => {
        const a = [{ id: 'tmdb:1' }, { id: 'tmdb:2' }];
        const b = [{ id: 'tmdb:1' }, { id: 'tmdb:3' }]; // tmdb:1 duplicated

        const result = interleaveMultipleResults([a, b], 20);
        const ids = result.map(r => r.id);
        // Round-robin: a[0]=tmdb:1, b[0]=tmdb:1(dup-skipped), a[1]=tmdb:2, b[1]=tmdb:3
        expect(ids).toEqual(['tmdb:1', 'tmdb:2', 'tmdb:3']);
    });

    it('respects limit parameter', () => {
        const a = Array.from({ length: 15 }, (_, i) => ({ id: `a${i}` }));
        const b = Array.from({ length: 15 }, (_, i) => ({ id: `b${i}` }));

        const result = interleaveMultipleResults([a, b], 10);
        expect(result).toHaveLength(10);
    });

    it('handles empty arrays', () => {
        const result = interleaveMultipleResults([[], [{ id: '1' }]], 20);
        expect(result).toEqual([{ id: '1' }]);
    });

    it('handles single source', () => {
        const a = [{ id: '1' }, { id: '2' }];
        const result = interleaveMultipleResults([a], 20);
        expect(result).toEqual(a);
    });
});

// ============================================
// Test 3: Preset migration
// ============================================
describe('Preset migration — all presets use queries[] format', () => {
    it('all presets in getPresets() have queries array', () => {
        // Use the real presets module
        jest.resetModules();
        const { getPresets: getRealPresets } = jest.requireActual('../src/data/presets');
        const presets = getRealPresets();

        for (const preset of presets) {
            expect(preset).toHaveProperty('queries');
            expect(Array.isArray(preset.queries)).toBe(true);
            expect(preset.queries.length).toBeGreaterThanOrEqual(1);
        }
    });

    it('all presets have presentation_strategy field', () => {
        jest.resetModules();
        const { getPresets: getRealPresets } = jest.requireActual('../src/data/presets');
        const presets = getRealPresets();

        for (const preset of presets) {
            expect(preset).toHaveProperty('presentation_strategy');
            expect(['popularity', 'interleave']).toContain(preset.presentation_strategy);
        }
    });

    it('presets with actual TMDB params have strategy: discovery in first query', () => {
        jest.resetModules();
        const { getPresets: getRealPresets } = jest.requireActual('../src/data/presets');
        const presets = getRealPresets();

        // Filter to presets with non-empty queries (excluding trakt/signature placeholders)
        const activePresets = presets.filter(p =>
            p.queries.length > 0 && Object.keys(p.queries[0]).length > 0
        );

        for (const preset of activePresets) {
            expect(preset.queries[0].strategy).toBe('discovery');
        }
    });
});

// ============================================
// Test 4: Keyword sanitization in buildDiscoveryParams
// ============================================
describe('buildDiscoveryParams — keyword mixing sanitization', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getTmdbIdByName.mockImplementation((_key, _type, name) => {
            // Return predictable IDs based on keyword name
            const map = { 'cyberpunk': '100', 'neon': '200', 'hacker': '300' };
            return Promise.resolve(map[name] || name);
        });
    });

    it('normalizes mixed pipe+comma separators in keyword to pipe (OR)', async () => {
        const params = await buildDiscoveryParams({
            keyword: 'cyberpunk|neon, hacker'
        }, 'tmdb-key', 'movie', {});

        // Mixed separators should be normalized to pipe
        // All 3 keywords should be resolved to IDs joined by pipe
        expect(params.with_keywords).toBe('100|200|300');
    });

    it('preserves pure pipe (OR) separator', async () => {
        const params = await buildDiscoveryParams({
            keyword: 'cyberpunk|neon'
        }, 'tmdb-key', 'movie', {});

        expect(params.with_keywords).toBe('100|200');
    });

    it('preserves pure comma (AND) separator', async () => {
        const params = await buildDiscoveryParams({
            keyword: 'cyberpunk,neon'
        }, 'tmdb-key', 'movie', {});

        expect(params.with_keywords).toBe('100,200');
    });
});

// ============================================
// Test 5: AI prompts keyword mixing prevention
// ============================================
describe('AI prompts — keyword mixing prevention rule', () => {
    it('BASE_RULES contains keyword mixing prevention directive', () => {
        const { BASE_RULES } = require('../src/ai/prompts');
        expect(BASE_RULES).toContain('RULE: For keywords, use ONLY ONE operator per query block');
        expect(BASE_RULES).toContain('NEVER mix them in the same string');
    });
});

// ============================================
// Test 6: UserList schema includes new fields
// ============================================
describe('UserList schema — Universal Catalog Schema fields', () => {
    it('source code includes queries and presentation_strategy fields', () => {
        const fs = require('fs');
        const source = fs.readFileSync(
            require.resolve('../src/db/models/UserList.js'),
            'utf8'
        );

        expect(source).toContain('queries:');
        expect(source).toContain('presentation_strategy:');
        expect(source).toContain("enum: ['popularity', 'interleave']");
    });
});

// ============================================
// Test 7: Fallback no longer depends on skip === 0
// ============================================
describe('Fallback state — no skip===0 dependency', () => {
    it('executeComplexStrategy does not check skip === 0 for fallback', () => {
        const fs = require('fs');
        const source = fs.readFileSync(
            require.resolve('../src/handlers/catalogHandler.js'),
            'utf8'
        );

        // Find the executeComplexStrategy function
        const fnStart = source.indexOf('async function executeComplexStrategy');
        const fnEnd = source.indexOf('function interleaveResults', fnStart);
        const fnBody = source.substring(fnStart, fnEnd);

        // Must NOT have skip === 0 condition for fallback
        expect(fnBody).not.toContain('skip === 0');
        // Should use fallback flag cache
        expect(fnBody).toContain('_fallbackFlagCache');
    });
});
