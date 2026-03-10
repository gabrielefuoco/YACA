/**
 * Tests for critical bug fixes in catalogHandler.js:
 * 1. Legacy override on with_keywords — AND separator preservation
 * 2. Bulk hydration via TmdbScoringData
 * 3. Merge catalog pagination skip propagation
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

const { buildDiscoveryParams } = require('../src/handlers/catalogHandler');
const { getTmdbMovieDetails } = require('../src/clients/tmdb');
const TmdbScoringData = require('../src/db/models/TmdbScoringData');

// ============================================
// Test 1: Legacy with_keywords AND/OR preservation
// ============================================
describe('buildDiscoveryParams — with_keywords separator preservation', () => {
    it('preserves comma (AND) when with_keywords uses commas', async () => {
        const params = await buildDiscoveryParams({
            with_keywords: '123,456,789',
            sort_by: 'popularity.desc'
        }, 'tmdb-key', 'movie', {});

        // Commas (AND logic) must be preserved — not converted to pipes
        expect(params.with_keywords).toBe('123,456,789');
    });

    it('preserves pipe (OR) when with_keywords uses pipes', async () => {
        const params = await buildDiscoveryParams({
            with_keywords: '123|456|789',
            sort_by: 'popularity.desc'
        }, 'tmdb-key', 'movie', {});

        expect(params.with_keywords).toBe('123|456|789');
    });

    it('deduplicates while preserving AND separator', async () => {
        const params = await buildDiscoveryParams({
            with_keywords: '123,456,123',
            sort_by: 'popularity.desc'
        }, 'tmdb-key', 'movie', {});

        expect(params.with_keywords).toBe('123,456');
    });

    it('deduplicates while preserving OR separator', async () => {
        const params = await buildDiscoveryParams({
            with_keywords: '100|200|100',
            sort_by: 'popularity.desc'
        }, 'tmdb-key', 'movie', {});

        expect(params.with_keywords).toBe('100|200');
    });

    it('treats a single keyword without any separator as AND (comma default)', async () => {
        const params = await buildDiscoveryParams({
            with_keywords: '999',
            sort_by: 'popularity.desc'
        }, 'tmdb-key', 'movie', {});

        expect(params.with_keywords).toBe('999');
    });

    it('with_genres normalization still always uses pipes (genres are always OR)', async () => {
        const params = await buildDiscoveryParams({
            with_genres: '28,53',
            sort_by: 'popularity.desc'
        }, 'tmdb-key', 'movie', {});

        // Genres always use OR (pipe) — this behavior should remain unchanged
        expect(params.with_genres).toBe('28|53');
    });
});

// ============================================
// Test 2: Bulk hydration via TmdbScoringData — String type consistency
// ============================================
describe('hydrateResultsFromLocalDetailsCache — bulk TmdbScoringData query', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('uses String keys consistently in scoringMap to match normalizeContentId output', () => {
        // The fix ensures scoringMap keys are String (via String(doc.tmdbId))
        // and lookups use normalizeContentId which returns String.
        // Verify the source code uses String() on map set and normalizeContentId on map get.
        const fs = require('fs');
        const source = fs.readFileSync(
            require.resolve('../src/handlers/catalogHandler.js'),
            'utf8'
        );

        const hydrateSection = source.substring(
            source.indexOf('async function hydrateResultsFromLocalDetailsCache'),
            source.indexOf('// Fase 2:')
        );

        // Must NOT cast to Number for tmdbIds
        expect(hydrateSection).not.toContain('Number(normalizeContentId');
        // Must use String() when setting map keys from MongoDB docs
        expect(hydrateSection).toContain('String(doc.tmdbId)');
    });

    it('scoringMap lookup uses normalizeContentId (String) not Number()', () => {
        const fs = require('fs');
        const source = fs.readFileSync(
            require.resolve('../src/handlers/catalogHandler.js'),
            'utf8'
        );

        // Find the phase 2 section
        const phase2Start = source.indexOf('// Fase 2:');
        const phase2End = source.indexOf('// Fallback:', phase2Start);
        const phase2Section = source.substring(phase2Start, phase2End);

        // The lookup key must be from normalizeContentId (String), not Number()
        expect(phase2Section).toContain('const tmdbId = normalizeContentId(item.id)');
        expect(phase2Section).not.toContain('Number(normalizeContentId');
    });
});

// ============================================
// Test 3: Merge catalog pagination — no double-skip
// ============================================
describe('Merge catalog fetchSource — no double-skip pagination', () => {
    it('should not hardcode skip=0 in executeComplexStrategy calls', () => {
        const fs = require('fs');
        const source = fs.readFileSync(
            require.resolve('../src/handlers/catalogHandler.js'),
            'utf8'
        );

        const mergeSection = source.substring(
            source.indexOf('const fetchSource = async (idx)'),
            source.indexOf('const [resA, resB]')
        );

        // Verify skip is passed instead of hardcoded 0
        expect(mergeSection).toContain('srcType, skip, activeProfileSettings');
        expect(mergeSection).not.toMatch(/srcType,\s*0,\s*activeProfileSettings/);
    });

    it('interleaveResults and popularity slice use 0 offset since data is already paginated', () => {
        const fs = require('fs');
        const source = fs.readFileSync(
            require.resolve('../src/handlers/catalogHandler.js'),
            'utf8'
        );

        // Find the merge results section (between listB and finalizeCatalog)
        const mergeResultStart = source.indexOf("if (strategy === 'mixed')");
        const mergeResultEnd = source.indexOf('return await finalizeCatalog(results', mergeResultStart);
        const mergeResultSection = source.substring(mergeResultStart, mergeResultEnd);

        // interleaveResults must use 0 offset (data already skipped by source fetchers)
        expect(mergeResultSection).toContain('interleaveResults(listA, listB, 0, 20)');
        // Popularity slice must use .slice(0, 20), NOT .slice(skip, skip + 20)
        expect(mergeResultSection).toContain('.slice(0, 20)');
        expect(mergeResultSection).not.toContain('.slice(skip, skip + 20)');
    });
});

// ============================================
// Test 4: interleaveResults with skip=0 returns correct page
// ============================================
describe('interleaveResults — functional pagination tests', () => {
    const { interleaveResults } = require('../src/handlers/catalogHandler');

    it('returns up to limit items when skip is 0', () => {
        const listA = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, name: `A${i}` }));
        const listB = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, name: `B${i}` }));

        const result = interleaveResults(listA, listB, 0, 20);
        expect(result.length).toBe(20);
        // First item should be from listA
        expect(result[0].id).toBe('a0');
    });

    it('returns empty when skip exceeds combined length (the old double-skip bug)', () => {
        // Simulates what happened with the old bug: 20 items each, skip=40 → empty
        const listA = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, name: `A${i}` }));
        const listB = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, name: `B${i}` }));

        const result = interleaveResults(listA, listB, 40, 20);
        // This proves skip=40 on a 40-element combined array gives nothing
        expect(result.length).toBe(0);
    });
});
